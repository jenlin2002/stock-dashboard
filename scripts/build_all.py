"""全台股總表：上市＋上櫃普通股（公司，不含 ETF），輸出 data/all/stocks.json。

資料來源都是一次拿全部股票的官方 OpenAPI（證交所 TWSE、櫃買中心 TPEx）：
  公司基本資料  TWSE opendata/t187ap03_L        TPEx mopsfin_t187ap03_O   （範圍＝公司，自然排除 ETF）
  每日收盤      TWSE exchangeReport/STOCK_DAY_ALL TPEx tpex_mainboard_daily_close_quotes
  本益比等      TWSE exchangeReport/BWIBBU_ALL    TPEx tpex_mainboard_peratio_analysis
  月營收        TWSE opendata/t187ap05_L        TPEx mopsfin_t187ap05_O
  綜合損益      TWSE opendata/t187ap06_L_{ci,basi,bd,fh,ins,mim}（一般業、銀行、證券、金控、保險、其他）
               TPEx mopsfin_t187ap06_O_{同上}

輸出用「欄位表＋列陣列」省空間：{"updated", "fields": [...], "rows": [[...], ...]}
"""
import json
import sys
import time

import requests

import fundamentals
from common import DATA, load_json, log, today_str, warn

TWSE = "https://openapi.twse.com.tw/v1/"
TPEX = "https://www.tpex.org.tw/openapi/v1/"
IS_KINDS = ["ci", "basi", "bd", "fh", "ins", "mim"]

FIELDS = [
    "code", "name", "market", "industry",
    "date", "close", "change", "change_pct", "volume",          # volume：張
    "mktcap",                                                  # 市值（元）＝收盤 × 已發行普通股數
    "pe", "pb", "yield",
    "rev_month", "rev", "rev_mom", "rev_yoy", "rev_cum_yoy",    # rev：元
    "eps_period", "eps_ytd", "gross_margin", "op_margin",      # 最新一季累計（年初至今）
    "eps_ttm",                                                 # 近四季 EPS ≈ 收盤 ÷ 本益比（證交所本益比即以近四季 EPS 計）
    # PEG 與評分卡（scripts/fundamentals.py）
    "pe_period",                                               # 本益比所用財報季（例 2026Q2）
    "eps_prev",                                                # 一年前的近四季 EPS（去年同一季財報）
    "eps_growth",                                              # 近四季 EPS 成長率 %
    "peg",                                                     # 本益比 ÷ EPS 成長率（EPS ≤ 0 或成長 ≤ 0 不計）
    "peg_est", "peg_note",                                     # 推估 PEG（本益比 ÷ 累計營收成長）與原因說明
    "roe",                                                     # 近四季 EPS ÷ 每股淨值 %
    "debt_ratio", "bvps",                                      # 負債比 %（負債÷資產）、每股淨值
    "rev_ttm", "psr",                                          # 近 12 個月營收（元）、股價營收比＝市值 ÷ 近 12 個月營收
    # 現金流量（scripts/fetch_cashflow.py 輪流更新的快取）
    "cf_period", "cfo_ttm", "capex_ttm", "fcf_ttm",            # 近四季營業現金流、資本支出（負數）、自由現金流（元）
    "pcf", "fcf_yield", "cfps", "fcfps",                       # 股價現金流量比、自由現金流殖利率 %、每股營業／自由現金流
]

session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (stock-dashboard)"


def get(url):
    for attempt in range(3):
        try:
            r = session.get(url, timeout=90)
            r.raise_for_status()
            text = r.text.strip()
            return json.loads(text) if text.startswith("[") else []
        except Exception as e:
            if attempt == 2:
                warn(f"{url} 失敗：{e}")
                return []
            time.sleep(3)


def num(x):
    """'1,234.5' / ' -0.10 ' / '--' / '' → float 或 None"""
    if x is None:
        return None
    s = str(x).replace(",", "").strip()
    if s in ("", "-", "--", "---", "N/A", "除權息", "除息", "除權"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def roc_date(s):
    """'1151008' → '2026-10-08'"""
    s = str(s or "").strip()
    if len(s) < 7:
        return None
    return f"{int(s[:-4]) + 1911}-{s[-4:-2]}-{s[-2:]}"


def roc_month(s):
    """'11508' → '2026-08'"""
    s = str(s or "").strip()
    if len(s) < 5:
        return None
    return f"{int(s[:-2]) + 1911}-{s[-2:]}"


def pick(d, *keys):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def r2(x, n=2):
    return None if x is None else round(x, n)


# ---- 公司基本資料（個股頁「公司資料」用）：data/all/profile.json ----
# 證交所欄位是中文；櫃買是英文欄名（沒逐一核對過，用關鍵字比對，找不到就留空）
PROFILE_FIELDS = ["full_name", "chairman", "gm", "spokesman", "founded", "listed", "capital", "par",
                  "address", "phone", "website", "auditor", "transfer_agent", "email"]
PROFILE_TW = {
    "full_name": "公司名稱", "chairman": "董事長", "gm": "總經理", "spokesman": "發言人",
    "founded": "成立日期", "listed": "上市日期", "capital": "實收資本額", "par": "普通股每股面額",
    "address": "住址", "phone": "總機電話", "website": "網址", "auditor": "簽證會計師事務所",
    "transfer_agent": "股票過戶機構", "email": "電子郵件信箱",
}
# 櫃買：(要包含的字, 不能包含的字)，比對時欄名轉小寫、只留英文字母
PROFILE_TPEX = {
    "full_name": (["companyname"], []),
    "chairman": (["chairman"], []),
    "gm": (["generalmanager"], []),
    "spokesman": (["spokesman", "spokesperson"], ["deputy", "title", "acting"]),
    "founded": (["incorporation", "establish", "founded"], []),
    "listed": (["listing", "listed"], []),
    "capital": (["paidin", "capital"], ["par"]),
    "par": (["parvalue"], []),
    "address": (["address"], ["email", "transfer", "english", "mail", "web"]),
    "phone": (["telephone", "phone"], ["transfer", "fax"]),
    "website": (["web", "url", "site"], []),
    "auditor": (["accountingfirm", "accountant"], ["cpa"]),
    "transfer_agent": (["stocktransferagent", "transferagent"], ["tel", "phone", "address"]),
    "email": (["email"], []),
}


def fmt_date(v):
    """'19830228'、'0720228'、'1983/02/28'、'72/02/28' → '1983-02-28'"""
    s = str(v or "").strip()
    parts = [p for p in s.replace("-", "/").replace(".", "/").split("/") if p]
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    elif s.isdigit() and len(s) in (6, 7, 8):
        y, m, d = int(s[:-4]), int(s[-4:-2]), int(s[-2:])
    else:
        return s or None
    if y < 1911:
        y += 1911
    return f"{y:04d}-{m:02d}-{d:02d}" if 1 <= m <= 12 and 1 <= d <= 31 else (s or None)


def clean_text(v):
    s = " ".join(str(v or "").split())
    return None if s in ("", "-", "--", "無") else s


def profile_of(x, market):
    keys = list(x.keys())
    out = []
    for f in PROFILE_FIELDS:
        v = None
        if market == "TWSE":
            v = x.get(PROFILE_TW[f])
        else:
            inc, exc = PROFILE_TPEX[f]
            for k in keys:
                nk = "".join(c for c in k.lower() if c.isalpha())
                if any(w in nk for w in inc) and not any(w in nk for w in exc):
                    v = x[k]
                    break
        if f in ("founded", "listed"):
            v = fmt_date(v)
        elif f == "capital":
            v = num(v)
            v = int(v) if v is not None else None
        elif f == "par":
            n = num("".join(c for c in str(v or "") if c.isdigit() or c == "."))
            v = n
        else:
            v = clean_text(v)
        out.append(v)
    return out


def write_profiles(profiles):
    if not profiles:
        warn("沒有公司基本資料，不更新 profile.json")
        return
    path = DATA / "all" / "profile.json"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(today_str()) + ',"fields":' + json.dumps(PROFILE_FIELDS) + ',"rows":{\n')
        f.write(",\n".join(json.dumps(c) + ":" + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for c, r in sorted(profiles.items())))
        f.write("\n}}\n")
    log(f"all/profile.json：{len(profiles)} 家，{path.stat().st_size // 1024} KB")


def main():
    stocks = {}
    profiles = {}

    # ---- 公司（範圍） ----
    for market, url, code_k, name_k, shares_k in (
        ("TWSE", TWSE + "opendata/t187ap03_L", "公司代號", "公司簡稱", "已發行普通股數或TDR原股發行股數"),
        ("TPEX", TPEX + "mopsfin_t187ap03_O", "SecuritiesCompanyCode", "CompanyAbbreviation", "IssueShares"),
    ):
        for x in get(url):
            code = str(x.get(code_k, "")).strip()
            if code:
                stocks[code] = {"code": code, "name": str(x.get(name_k, "")).strip(), "market": market, "industry": None, "_shares": num(x.get(shares_k))}
                try:
                    profiles[code] = profile_of(x, market)
                except Exception as e:
                    warn(f"{code} 公司資料解析失敗：{e}")
    if not stocks:
        warn("抓不到公司清單，中止")
        return 1

    # ---- 產業名稱：月營收資料帶中文產業別；沒有的用 FinMind 清單（data/stocklist.json）補 ----
    rev_rows = get(TWSE + "opendata/t187ap05_L") + get(TPEX + "mopsfin_t187ap05_O")
    for x in rev_rows:
        s = stocks.get(str(x.get("公司代號", "")).strip())
        if s and x.get("產業別"):
            s["industry"] = x["產業別"].strip()
    sl = load_json(DATA / "stocklist.json") or {}
    fm_ind = {row[0]: row[3] for row in sl.get("tw", [])}
    # FinMind 的產業名稱有少數和證交所不同，統一成證交所的叫法
    SAME = {"金融業": "金融保險業", "電子工業": "其他電子業"}
    for s in stocks.values():
        if not s["industry"]:
            s["industry"] = fm_ind.get(s["code"]) or "其他"
        s["industry"] = SAME.get(s["industry"], s["industry"])

    # ---- 每日收盤 ----
    for x in get(TWSE + "exchangeReport/STOCK_DAY_ALL"):
        s = stocks.get(x.get("Code"))
        if not s:
            continue
        close, chg = num(x.get("ClosingPrice")), num(x.get("Change"))
        s.update(date=roc_date(x.get("Date")), close=close, change=chg, volume=(num(x.get("TradeVolume")) or 0) // 1000)
    for x in get(TPEX + "tpex_mainboard_daily_close_quotes"):
        s = stocks.get(x.get("SecuritiesCompanyCode"))
        if not s:
            continue
        close, chg = num(x.get("Close")), num(x.get("Change"))
        s.update(date=roc_date(x.get("Date")), close=close, change=chg, volume=(num(x.get("TradingShares")) or 0) // 1000)
    for s in stocks.values():
        c, d = s.get("close"), s.get("change")
        s["change_pct"] = r2(d / (c - d) * 100) if c and d is not None and c - d else None

    # ---- 本益比、殖利率、股價淨值比 ----
    for x in get(TWSE + "exchangeReport/BWIBBU_ALL"):
        s = stocks.get(x.get("Code"))
        if s:
            s.update(pe=num(x.get("PEratio")), pb=num(x.get("PBratio")), **{"yield": num(x.get("DividendYield"))})
    for x in get(TPEX + "tpex_mainboard_peratio_analysis"):
        s = stocks.get(x.get("SecuritiesCompanyCode"))
        if s:
            s.update(pe=num(x.get("PriceEarningRatio")), pb=num(x.get("PriceBookRatio")), **{"yield": num(x.get("YieldRatio"))})

    # ---- 月營收（千元 → 元） ----
    for x in rev_rows:
        s = stocks.get(str(x.get("公司代號", "")).strip())
        if not s:
            continue
        rev = num(x.get("營業收入-當月營收"))
        s.update(
            rev_month=roc_month(x.get("資料年月")),
            rev=None if rev is None else int(rev * 1000),
            rev_mom=r2(num(x.get("營業收入-上月比較增減(%)"))),
            rev_yoy=r2(num(x.get("營業收入-去年同月增減(%)"))),
            rev_cum_yoy=r2(num(x.get("累計營業收入-前期比較增減(%)"))),
        )

    # ---- 綜合損益：最新一季（年初至今累計）EPS、毛利率、營益率 ----
    for kind in IS_KINDS:
        for base, prefix in ((TWSE, "opendata/t187ap06_L_"), (TPEX, "mopsfin_t187ap06_O_")):
            for x in get(base + prefix + kind):
                code = str(pick(x, "公司代號", "SecuritiesCompanyCode") or "").strip()
                s = stocks.get(code)
                if not s:
                    continue
                year, season = pick(x, "年度", "Year"), pick(x, "季別", "Season")
                rev = num(pick(x, "營業收入", "淨收益", "收益"))
                gross = num(pick(x, "營業毛利（毛損）淨額", "營業毛利（毛損）"))
                op = num(pick(x, "營業利益（損失）"))
                s.update(
                    eps_period=f"{int(year) + 1911}Q{int(season)}" if year and season else None,
                    eps_ytd=num(pick(x, "基本每股盈餘（元）")),
                    gross_margin=r2(gross / rev * 100) if gross is not None and rev else None,
                    op_margin=r2(op / rev * 100) if op is not None and rev else None,
                )

    for s in stocks.values():
        pe, c = s.get("pe"), s.get("close")
        s["eps_ttm"] = r2(c / pe) if pe and c else None
        s["mktcap"] = int(c * s["_shares"]) if c and s.get("_shares") else None
        if s.get("volume") is not None:
            s["volume"] = int(s["volume"])

    # ---- PEG：一年前的近四季 EPS（同一季財報）----
    latest = max((s["date"] for s in stocks.values() if s.get("date")), default=None)
    if latest:
        from datetime import date as _date
        hist, prev_day = fundamentals.eps_history(_date.fromisoformat(latest))
        log(f"PEG：比較 {latest} 與 {prev_day} 的近四季 EPS（{sum(1 for h in hist.values() if h['eps_prev'])} 家可比）")
        for code, h in hist.items():
            s = stocks.get(code)
            if s:
                s.update(h)
    for s in stocks.values():
        now, prev, pe = s.get("eps_ttm"), s.get("eps_prev"), s.get("pe")
        if now and prev and now > 0 and prev > 0:
            s["eps_growth"] = r2((now / prev - 1) * 100)
            # 成長超過 100% 多半是去年 EPS 太低（低基期），PEG 會失真，不計算
            if pe and 0 < s["eps_growth"] <= 100:
                s["peg"] = r2(pe / s["eps_growth"])
    # ---- 現金流量（近四季）----
    from fetch_cashflow import ttm as cf_ttm
    cf_cache = load_json(DATA / "all" / "cashflow.json") or {}
    for code, s in stocks.items():
        t = cf_ttm((cf_cache.get(code) or {}).get("q"))
        if not t:
            continue
        cfo, capex, period = t
        fcf = cfo + capex
        sh, cap = s.get("_shares"), s.get("mktcap")
        s.update(cf_period=period, cfo_ttm=int(cfo), capex_ttm=int(capex), fcf_ttm=int(fcf))
        if cap:
            s["pcf"] = r2(cap / cfo) if cfo > 0 else None
            s["fcf_yield"] = r2(fcf / cap * 100)
        if sh:
            s["cfps"], s["fcfps"] = r2(cfo / sh), r2(fcf / sh)
    log(f"現金流量：{sum(1 for s in stocks.values() if s.get('cf_period'))} 家有近四季資料（快取 {len(cf_cache)} 家）")

    # 推估 PEG：有獲利（有本益比）但 EPS 成長不能用時（衰退、低基期、沒有去年同季可比），
    # 改用今年累計營收成長率推估（標示「估」）；推不出來就記原因，網頁顯示原因而不是空白
    for s in stocks.values():
        if s.get("peg") is not None or not s.get("close"):
            continue
        pe, g, rg = s.get("pe"), s.get("eps_growth"), s.get("rev_cum_yoy")
        if not pe:
            s["peg_note"] = "虧損"
            continue
        why = "EPS 衰退" if g is not None and g <= 0 else "基期低" if g is not None and g > 100 else "無去年可比"
        if rg is not None and 0 < rg <= 100:
            s["peg_est"] = r2(pe / rg)
            s["peg_note"] = f"{why}，以累計營收成長 {rg:.1f}% 推估"
        else:
            s["peg_note"] = why + ("，營收也衰退" if rg is not None and rg <= 0 else "")

    # ---- 資產負債表：負債比、每股淨值、ROE ----
    for code, b in fundamentals.balance_sheets().items():
        s = stocks.get(code)
        if s:
            s.update(b)
    for s in stocks.values():
        if not s.get("bvps") and s.get("close") and s.get("pb"):
            s["bvps"] = r2(s["close"] / s["pb"])
        if s.get("eps_ttm") and s.get("bvps") and s["bvps"] > 0:
            s["roe"] = r2(s["eps_ttm"] / s["bvps"] * 100)

    # ---- 月營收歷史：近 12 個月營收、股價營收比；最新月份比 OpenAPI 新就用它 ----
    # 留 13 個月：每月 10 日前還有公司沒公布最新月份，這些公司改用前 12 個月
    rh = fundamentals.revenue_history(13)
    months = sorted(rh)
    if months:
        for code, s in stocks.items():
            have = [m for m in months if rh[m].get(code)]
            if not have:
                continue
            last = have[-1]                       # 這家公司最新公布的月份
            i = months.index(last)
            window = months[max(0, i - 11): i + 1]
            if len(window) == 12 and all(rh[m].get(code) for m in window):
                s["rev_ttm"] = int(sum(rh[m][code][0] for m in window) * 1000)  # 千元 → 元
                if s.get("mktcap") and s["rev_ttm"] > 0:
                    s["psr"] = r2(s["mktcap"] / s["rev_ttm"])
            cur = rh[last][code]
            if (s.get("rev_month") or "") < last:  # 比 OpenAPI 新才覆蓋
                prev_m = rh[months[i - 1]].get(code) if i > 0 else None
                s.update(
                    rev_month=last, rev=int(cur[0] * 1000),
                    rev_yoy=r2((cur[0] / cur[1] - 1) * 100) if cur[1] else None,
                    rev_mom=r2((cur[0] / prev_m[0] - 1) * 100) if prev_m and prev_m[0] else None,
                    rev_cum_yoy=r2((cur[2] / cur[3] - 1) * 100) if cur[2] and cur[3] else None,
                )
        log(f"月營收歷史：{months[0]}～{months[-1]}（最新月份已公布 {len(rh[months[-1]])} 家）")

    rows =[[s.get(f) for f in FIELDS] for s in sorted(stocks.values(), key=lambda s: s["code"])]
    out = {"updated": today_str(), "fields": FIELDS, "rows": rows}
    path = DATA / "all" / "stocks.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(out["updated"]) + ',"fields":' + json.dumps(FIELDS) + ',"rows":[\n')
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows))
        f.write("\n]}\n")
    write_profiles(profiles)
    priced = sum(1 for s in stocks.values() if s.get("close"))
    log(f"all/stocks.json：{len(rows)} 家（有收盤價 {priced}），{path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
