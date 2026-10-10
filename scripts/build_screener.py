"""選股器、四面評分要的全市場資料（LAYOUT-SPEC 第 7 步），輸出 data/screener-tw.json。

都是「一次拿全部股票」的官方資料，每天只要抓當天（第一次會往回補）：
  每日收盤（價、量）  證交所 MI_INDEX（ALLBUT0999）       櫃買 afterTrading/dailyQuotes
  三大法人（個股）    證交所 fund/T86（ALLBUT0999）       櫃買 insti/dailyTrade
  融資餘額（個股）    證交所 marginTrading/MI_MARGN（ALL） 櫃買 margin/balance
  每季 EPS（累計）    公開資訊觀測站 t163sb04（上市 sii、上櫃 otc，各季一次）

原始歷史放在 .cache/（不進 git；GitHub Actions 用 actions/cache 保留，遺失時會自動往回補）：
  .cache/price.json   近 70 個交易日的收盤、成交量（張）
  .cache/inst.json    近 10 個交易日的外資、投信、自營商買賣超（張）
  .cache/margin.json  近 10 個交易日的融資餘額（張）
每季 EPS 很少變，存在 data/all/eps_q.json（進 git）。

輸出（每檔一列，欄位見 FIELDS）：均線狀態、5／20 日漲跌、量比、60 日新高、外資連買天數、法人 5 日合計、融資增減、EPS 連續成長季數。
用法：python scripts/build_screener.py [--days 70]
"""
import argparse
import html
import json
import re
import sys
import time
from datetime import date, timedelta

import requests

from common import DATA, ROOT, load_json, log, today_str, warn

CACHE = ROOT / ".cache"
KEEP_PRICE, KEEP_FLOW = 70, 10
CODES = set()  # 全台股總表的代號（main 裡填）
FIELDS = [
    "code",
    "ma5", "ma20", "ma60",          # 均線（收盤）
    "above60",                      # 收盤站上季線（MA60）：1／0
    "bull",                         # 多頭排列 MA5 > MA20 > MA60：1／0
    "chg5", "chg20",                # 5、20 個交易日漲跌 %
    "vol_ratio",                    # 今日量 ÷ 近 20 日均量
    "high60",                       # 收盤創 60 日新高：1／0
    "fi_days",                      # 外資連續買超天數（最多 10）；連賣為負
    "fi_5", "it_5", "dl_5",         # 外資、投信、自營商近 5 日買賣超（張）
    "mg_chg", "mg_chg5",            # 融資餘額 1 日、5 日增減（張）
    "eps_q", "eps_q_yoy",           # 最新一季單季 EPS、和去年同季比 %
    "eps_up_q",                     # 單季 EPS 連續年增的季數（和去年同季比）
]

s = requests.Session()
s.headers["User-Agent"] = "Mozilla/5.0 (stock-dashboard)"
_last = {"twse": 0.0, "tpex": 0.0, "mops": 0.0}
GAP = {"twse": 3.2, "tpex": 1.2, "mops": 3.0}  # 證交所每 5 秒超過 3 次會被暫時封鎖


def fetch(kind, url, data=None):
    wait = GAP[kind] - (time.time() - _last[kind])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(3):
        try:
            r = s.post(url, data=data, timeout=60) if data else s.get(url, timeout=60)
            _last[kind] = time.time()
            r.raise_for_status()
            return r
        except Exception as e:
            if attempt == 2:
                warn(f"{url} 失敗：{e}")
                return None
            time.sleep(5 * (attempt + 1))


def num(x):
    t = re.sub(r"<[^>]+>", "", str(x or "")).replace(",", "").strip()
    try:
        return float(t)
    except ValueError:
        return None


def jget(kind, url):
    r = fetch(kind, url)
    if not r:
        return None
    try:
        return r.json()
    except ValueError:
        return None


def ok(j):
    return j and str(j.get("stat", "")).lower() == "ok"


def table(j, *words):
    """回傳標題含有所有 words 的第一張表（fields, data）"""
    for t in (j or {}).get("tables") or []:
        title = t.get("title") or ""
        if all(w in title for w in words) and t.get("data"):
            return t.get("fields") or [], t["data"]
    return None, None


# ---------- 每日：價量、法人、融資 ----------
def day_price(d):
    """回傳 {code: [close, vol 張]}；沒開盤回傳 None"""
    out = {}
    j = jget("twse", f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json")
    if not ok(j):
        return None
    f, rows = table(j, "每日收盤行情")
    if not rows:
        return None
    ic, iv, ip = f.index("證券代號"), f.index("成交股數"), f.index("收盤價")
    for r in rows:
        c = num(r[ip])
        if c:
            out[r[ic].strip()] = [c, round((num(r[iv]) or 0) / 1000)]
    j = jget("tpex", f"https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date={d:%Y/%m/%d}&response=json")
    f, rows = table(j, "上櫃股票行情") if ok(j) else (None, None)
    if rows:
        ic, ip, iv = f.index("代號"), f.index("收盤"), f.index("成交股數")
        for r in rows:
            c = num(r[ip])
            if c:
                out[r[ic].strip()] = [c, round((num(r[iv]) or 0) / 1000)]
    else:
        warn(f"{d} 櫃買收盤行情抓不到")
    return out


def day_inst(d):
    """{code: [外資, 投信, 自營商] 買賣超張數}"""
    out = {}
    j = jget("twse", f"https://www.twse.com.tw/rwd/zh/fund/T86?date={d:%Y%m%d}&selectType=ALLBUT0999&response=json")
    if ok(j) and j.get("data"):
        f = j["fields"]
        ic = f.index("證券代號")
        ifo = next(i for i, x in enumerate(f) if x.startswith("外陸資買賣超股數"))
        iit = f.index("投信買賣超股數")
        idl = next(i for i, x in enumerate(f) if x == "自營商買賣超股數")
        for r in j["data"]:
            out[r[ic].strip()] = [round((num(r[ifo]) or 0) / 1000), round((num(r[iit]) or 0) / 1000), round((num(r[idl]) or 0) / 1000)]
    j = jget("tpex", f"https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date={d:%Y/%m/%d}&response=json")
    f, rows = table(j, "三大法人") if ok(j) else (None, None)
    if rows:
        # 欄位名稱重複（買進／賣出／買賣超各一組），依位置：2-4 外資（不含外資自營商）、11-13 投信、20-22 自營商合計
        for r in rows:
            if len(r) >= 23:
                out[r[0].strip()] = [round((num(r[4]) or 0) / 1000), round((num(r[13]) or 0) / 1000), round((num(r[22]) or 0) / 1000)]
    return out or None


def day_margin(d):
    """{code: 融資今日餘額（張）}"""
    out = {}
    j = jget("twse", f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={d:%Y%m%d}&selectType=ALL&response=json")
    f, rows = table(j, "融資融券彙總") if ok(j) else (None, None)
    if rows:
        ic, ib = f.index("代號"), f.index("今日餘額")  # 第一個「今日餘額」是融資
        for r in rows:
            v = num(r[ib])
            if v is not None:
                out[r[ic].strip()] = round(v)
    j = jget("tpex", f"https://www.tpex.org.tw/www/zh-tw/margin/balance?date={d:%Y/%m/%d}&response=json")
    f, rows = table(j, "融資融券餘額") if ok(j) else (None, None)
    if rows:
        ib = f.index("資餘額") if "資餘額" in f else 6
        for r in rows:
            v = num(r[ib])
            if v is not None:
                out[r[0].strip()] = round(v)
    return out or None


def fill(name, getter, keep, max_back):
    """快取裡補到最近 keep 個交易日：從今天往回，遇到快取沒有的交易日才抓。"""
    path = CACHE / f"{name}.json"
    cache = load_json(path) or {"days": {}, "closed": []}
    days, closed = cache["days"], set(cache.get("closed", []))
    d, got, tried, fetched = date.today(), 0, 0, 0
    while got < keep and tried < max_back:
        tried += 1
        ds = d.isoformat()
        if d.weekday() < 5 and ds not in closed:
            if ds in days:
                got += 1
            elif d < date.today() or time.localtime().tm_hour >= 15:  # 今天要收盤後才有
                v = getter(d)
                fetched += 1
                if v and CODES:
                    v = {k: x for k, x in v.items() if k in CODES}  # 只留總表裡的普通股（不存權證、ETF）
                if v:
                    days[ds] = v
                    got += 1
                elif d < date.today() - timedelta(days=1):
                    closed.add(ds)  # 過去的日子沒資料＝休市，記下來不再抓
        d -= timedelta(days=1)
    keepd = sorted(days)[-keep:]
    if CODES:
        days = {k: {c: x for c, x in days[k].items() if c in CODES} for k in keepd}
    cache = {"days": {k: days[k] for k in keepd}, "closed": sorted(x for x in closed if x >= (date.today() - timedelta(days=max_back + 10)).isoformat())}
    CACHE.mkdir(exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, separators=(",", ":"))
    log(f"{name}：快取 {len(keepd)} 個交易日（{keepd[0] if keepd else '—'}～{keepd[-1] if keepd else '—'}），這次抓了 {fetched} 天")
    return [(k, cache["days"][k]) for k in keepd]


# ---------- 每季 EPS（公開資訊觀測站 t163sb04：綜合損益表彙總，EPS 為年初至今累計） ----------
class Rows(__import__("html.parser").parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.inc = [], None, None, False

    def handle_starttag(self, tag, a):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell, self.inc = [], True

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None and self.inc:
            self.row.append(html.unescape("".join(self.cell)).strip())
            self.inc = False
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.inc:
            self.cell.append(data)


def mops_eps(year, season, typek):
    r = fetch("mops", "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04",
              {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "isQuery": "Y", "TYPEK": typek, "year": str(year - 1911), "season": f"{season:02d}"})
    if not r:
        return {}
    r.encoding = "utf-8"
    p = Rows()
    p.feed(r.text)
    out, col = {}, None
    for row in p.rows:
        if "公司代號" in row and any("每股盈餘" in c for c in row):
            col = next(i for i, c in enumerate(row) if "基本每股盈餘" in c or c.startswith("每股盈餘"))
            continue
        if col is not None and len(row) > col and re.fullmatch(r"\d{4}[A-Z]?", row[0]):
            v = num(row[col])
            if v is not None:
                out[row[0]] = v
    return out


def quarters_back(n):
    """最近 n 季（只算財報應已公布的季：Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31）"""
    t = date.today()
    # 找最新一季已過截止日的
    y, q = t.year, 0
    for qq, d in ((1, date(t.year, 5, 15)), (2, date(t.year, 8, 14)), (3, date(t.year, 11, 14))):
        if t >= d:
            q = qq
    if q == 0:
        y, q = (t.year - 1, 4) if t >= date(t.year, 3, 31) else (t.year - 1, 3)
    out = []
    for _ in range(n):
        out.append((y, q))
        y, q = (y, q - 1) if q > 1 else (y - 1, 4)
    return out[::-1]


def update_eps():
    path = DATA / "all" / "eps_q.json"
    cache = load_json(path) or {"ytd": {}}
    ytd = cache["ytd"]
    qs = quarters_back(10)
    for i, (y, q) in enumerate(qs):
        k = f"{y}Q{q}"
        # 最新兩季每次都重抓（有公司晚公布、更正），其他季沒有才抓
        if k in ytd and i < len(qs) - 2:
            continue
        got = {}
        for typek in ("sii", "otc"):
            got.update(mops_eps(y, q, typek))
        if got:
            ytd[k] = got
            log(f"EPS {k}：{len(got)} 家")
        else:
            warn(f"EPS {k} 抓不到")
    ytd = {k: ytd[k] for k in sorted(ytd)[-12:]}
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(today_str()) + ',"ytd":{\n')
        f.write(",\n".join(json.dumps(k) + ":" + json.dumps(v, separators=(",", ":")) for k, v in sorted(ytd.items())))
        f.write("\n}}\n")
    return ytd


def single_quarter(ytd):
    """累計 EPS → 單季 EPS：{code: {"2026Q2": eps, ...}}"""
    out = {}
    for k in sorted(ytd):
        y, q = int(k[:4]), int(k[-1])
        prev = ytd.get(f"{y}Q{q - 1}") if q > 1 else None
        for code, v in ytd[k].items():
            if q == 1:
                out.setdefault(code, {})[k] = v
            elif prev and code in prev:
                out.setdefault(code, {})[k] = round(v - prev[code], 2)
    return out


def r2(x):
    return None if x is None else round(x, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-eps", action="store_true", help="不抓每季 EPS")
    args = ap.parse_args()

    stocks = load_json(DATA / "all" / "stocks.json")
    if not stocks:
        warn("沒有 data/all/stocks.json，先跑 build_all.py")
        return 1
    codes = [r[0] for r in stocks["rows"]]
    CODES.update(codes)

    price = fill("price", day_price, KEEP_PRICE, 120)
    inst = fill("inst", day_inst, KEEP_FLOW, 25)
    margin = fill("margin", day_margin, KEEP_FLOW, 25)
    sq = {}
    try:
        sq = single_quarter((load_json(DATA / "all" / "eps_q.json") or {}).get("ytd", {}) if args.no_eps else update_eps())
    except Exception as e:
        warn(f"每季 EPS 失敗：{e}")
        sq = single_quarter((load_json(DATA / "all" / "eps_q.json") or {}).get("ytd", {}))
    if not price:
        warn("沒有價格資料，中止")
        return 1

    rows = []
    for code in codes:
        cl = [d[1].get(code, [None])[0] for d in price]
        vo = [d[1].get(code, [None, None])[1] for d in price]
        c = [x for x in cl if x is not None]
        ma = lambda n: (sum(c[-n:]) / n) if len(c) >= n else None  # noqa: E731
        m5, m20, m60 = ma(5), ma(20), ma(60)
        last = c[-1] if c else None
        chg = lambda n: r2((c[-1] / c[-1 - n] - 1) * 100) if len(c) > n and c[-1 - n] else None  # noqa: E731
        v = [x for x in vo if x is not None]
        vr = r2(v[-1] / (sum(v[-21:-1]) / 20)) if len(v) >= 21 and sum(v[-21:-1]) > 0 else None
        hi = 1 if len(c) >= 60 and last >= max(c[-60:]) else 0 if len(c) >= 60 else None
        # 法人：最新在後
        fl = [d[1].get(code) for d in inst]
        fl = [x for x in fl if x]
        fd = 0
        for x in reversed(fl):
            if x[0] > 0 and fd >= 0:
                fd += 1
            elif x[0] < 0 and fd <= 0:
                fd -= 1
            else:
                break
        f5 = fl[-5:]
        mg = [d[1].get(code) for d in margin]
        mg = [x for x in mg if x is not None]
        q = sq.get(code, {})
        ks = sorted(q)
        eq = q[ks[-1]] if ks else None
        yoy, up = None, 0
        if ks:
            def ly(k):
                return f"{int(k[:4]) - 1}{k[4:]}"
            if ly(ks[-1]) in q and q[ly(ks[-1])]:
                yoy = r2((eq / q[ly(ks[-1])] - 1) * 100) if q[ly(ks[-1])] > 0 else None
            for k in reversed(ks):
                if ly(k) in q and q[k] > q[ly(k)]:
                    up += 1
                else:
                    break
        rows.append([
            code, r2(m5), r2(m20), r2(m60),
            (1 if last >= m60 else 0) if m60 and last else None,
            (1 if m5 > m20 > m60 else 0) if m5 and m20 and m60 else None,
            chg(5), chg(20), vr, hi,
            fd if fl else None,
            sum(x[0] for x in f5) if f5 else None, sum(x[1] for x in f5) if f5 else None, sum(x[2] for x in f5) if f5 else None,
            (mg[-1] - mg[-2]) if len(mg) >= 2 else None, (mg[-1] - mg[-6]) if len(mg) >= 6 else None,
            eq, yoy, up if ks else None,
        ])
    out = DATA / "screener-tw.json"
    meta = {"updated": today_str(), "price_date": price[-1][0], "inst_date": inst[-1][0] if inst else None,
            "margin_date": margin[-1][0] if margin else None, "eps_quarter": max((k for q in sq.values() for k in q), default=None)}
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("{" + ",".join(json.dumps(k) + ":" + json.dumps(v) for k, v in meta.items()) + ',"fields":' + json.dumps(FIELDS) + ',"rows":[\n')
        f.write(",\n".join(json.dumps(r, separators=(",", ":")) for r in rows))
        f.write("\n]}\n")
    log(f"screener-tw.json：{len(rows)} 檔，價格到 {meta['price_date']}，法人到 {meta['inst_date']}，融資到 {meta['margin_date']}，EPS 到 {meta['eps_quarter']}，{out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
