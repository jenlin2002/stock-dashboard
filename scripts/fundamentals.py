"""全台股基本面（build_all.py 用）：PEG 所需的一年前近四季 EPS、資產負債表、近 12 個月營收。

一年前近四季 EPS：證交所／櫃買中心每天的本益比＝收盤 ÷ 近四季 EPS，所以
  一年前那天的「收盤 ÷ 本益比」就是當時的近四季 EPS（一個請求拿全部股票，不用逐檔回補）。
  並核對「財報年/季」：現在是 115 年第 2 季，一年前那份必須是 114 年第 2 季才拿來比。
  本益比空白（虧損）的股票拿不到，PEG 本來就不適用。
"""
import html
import json
import re
import time
from datetime import date, timedelta

import requests

from common import DATA, warn

session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (stock-dashboard)"


def _get(url, params=None, as_json=True, encoding=None):
    for attempt in range(3):
        try:
            time.sleep(1)  # 證交所網站有頻率限制
            r = session.get(url, params=params, timeout=90)
            r.raise_for_status()
            if encoding:
                r.encoding = encoding
            return r.json() if as_json else r.text
        except Exception as e:
            if attempt == 2:
                warn(f"{url} {params or ''} 失敗：{e}")
                return None
            time.sleep(5)


def _num(x):
    s = str(x if x is not None else "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _period(s):
    """'114/2' 或 '114Q2' → (2025, 2)"""
    m = re.match(r"(\d+)\D+(\d)", str(s or ""))
    return (int(m.group(1)) + 1911, int(m.group(2))) if m else None


def _roc(d):
    return f"{d.year - 1911}/{d.month:02d}/{d.day:02d}"


# ---------- 本益比快照（含財報年/季） ----------

def pe_snapshot(d):
    """某一天全部股票的 {代號: (收盤, 本益比, (年, 季))}；那天沒開市就回傳空 dict。"""
    out = {}
    j = _get("https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d", {"date": d.strftime("%Y%m%d"), "selectType": "ALL", "response": "json"})
    if j and j.get("stat") == "OK":
        f = j["fields"]
        ic, ip, iq = f.index("收盤價"), f.index("本益比"), f.index("財報年/季")
        for row in j["data"]:
            out[row[0]] = (_num(row[ic]), _num(row[ip]), _period(row[iq]))
    # 上櫃：本益比與收盤價分在兩個報表
    j = _get("https://www.tpex.org.tw/web/stock/aftertrading/peratio_analysis/pera_result.php", {"l": "zh-tw", "d": _roc(d), "o": "json"})
    q = _get("https://www.tpex.org.tw/www/zh-tw/afterTrading/otc", {"date": d.strftime("%Y/%m/%d"), "type": "EW", "response": "json"})
    if j and j.get("tables") and q and q.get("tables") and str(q.get("date")) == d.strftime("%Y%m%d"):
        closes = {row[0]: _num(row[2]) for row in q["tables"][0].get("data", [])}
        t = j["tables"][0]
        f = t["fields"]
        ip, iq = f.index("本益比"), f.index("財報年/季")
        for row in t.get("data", []):
            out[row[0]] = (closes.get(row[0]), _num(row[ip]), _period(row[iq]))
    return out


def eps_history(latest):
    """回傳 {代號: {"pe_period": "2026Q2", "eps_prev": 一年前近四季 EPS}}；latest 是最新交易日（date）。"""
    cur = pe_snapshot(latest)
    prev, d = {}, latest - timedelta(days=365)
    for _ in range(10):  # 一年前那天可能是假日，往前找最近的交易日
        prev = pe_snapshot(d)
        if len(prev) > 500:
            break
        d -= timedelta(days=1)
    out = {}
    for code, (_, _, per) in cur.items():
        if not per:
            continue
        item = {"pe_period": f"{per[0]}Q{per[1]}", "eps_prev": None}
        p = prev.get(code)
        if p and p[0] and p[1] and p[2] == (per[0] - 1, per[1]):  # 一定要是去年同一季的財報
            item["eps_prev"] = round(p[0] / p[1], 2)
        out[code] = item
    return out, d.isoformat()


# ---------- 資產負債表（最新一季） ----------

def balance_sheets():
    """{代號: {"debt_ratio": 負債÷資產 %, "bvps": 每股淨值}}"""
    out = {}
    for kind in ("ci", "basi", "bd", "fh", "ins", "mim"):
        for url in (f"https://openapi.twse.com.tw/v1/opendata/t187ap07_L_{kind}",
                    f"https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_{kind}"):
            rows = _get(url) or []
            for x in rows:
                code = str(x.get("公司代號") or x.get("SecuritiesCompanyCode") or "").strip()
                assets = _num(x.get("資產總計") or x.get("資產總額"))
                debt = _num(x.get("負債總計") or x.get("負債總額"))
                bvps = _num(x.get("每股參考淨值"))
                if code:
                    out[code] = {
                        "debt_ratio": round(debt / assets * 100, 2) if debt is not None and assets else None,
                        "bvps": bvps if bvps else None,
                    }
    return out


# ---------- 月營收歷史（公開資訊觀測站彙總報表） ----------

HIST = DATA / "all" / "revenue_hist.json"


def _month_file(y, m, market, foreign):
    """t21sc03_{民國年}_{月}_{0 本國／1 外國(KY)}.html → {代號: [當月, 去年當月, 今年累計, 去年累計]}（千元）"""
    text = _get(f"https://mopsov.twse.com.tw/nas/t21/{market}/t21sc03_{y - 1911}_{m}_{foreign}.html", as_json=False, encoding="big5")
    out = {}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", text or "", re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) >= 9 and re.fullmatch(r"[0-9A-Z]{4,6}", cells[0]):
            # 欄位：代號、名稱、當月、上月、去年當月、…、今年累計、去年累計、累計增減%、備註（從後面數比較穩）
            out[cells[0]] = [_num(cells[2]), _num(cells[4]), _num(cells[-4]), _num(cells[-3])]
    return out


def revenue_history(months=12):
    """更新並回傳 {"YYYY-MM": {代號: [當月, 去年當月, 今年累計, 去年累計]}}，保留最近 months+1 個月。
    已抓過的月份存在 data/all/revenue_hist.json，每次只補新的、並重抓最近兩個月（公司偶爾更正）。"""
    hist = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else {}
    t = date.today()
    y, m = (t.year, t.month - 1) if t.month > 1 else (t.year - 1, 12)  # 從上個月往回找
    keys, skipped = [], 0
    while len(keys) < months:
        key = f"{y}-{m:02d}"
        if key not in hist or len(keys) < 2:  # 沒抓過的月份，或最近兩個月（可能有更正）
            data = {}
            for market in ("sii", "otc"):
                for foreign in (0, 1):
                    data.update(_month_file(y, m, market, foreign))
            if len(data) > 500:
                hist[key] = data
        if key in hist:
            keys.append(key)
        elif not keys and skipped < 2:  # 最新月份還沒公布：往前一個月
            skipped += 1
        else:
            warn(f"月營收 {key} 抓不到，近 12 個月營收可能不完整")
            break
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    hist = {k: hist[k] for k in sorted(keys)}
    HIST.parent.mkdir(parents=True, exist_ok=True)
    HIST.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return hist
