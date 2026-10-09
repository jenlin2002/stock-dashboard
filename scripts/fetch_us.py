"""抓美股資料，輸出 data/us/{ticker}.json（格式與台股相同，monthly_revenue 為空陣列）。

資料來源：
  - SEC EDGAR companyfacts   季度財報（營收、毛利、營業利益、淨利、EPS）
  - SEC EDGAR submissions    最新一份 10-K 連結
  - Yahoo Finance（yfinance）日 K、本益比、股價淨值比、殖利率、股利

SEC 要求 User-Agent 帶聯絡資訊，可用環境變數 SEC_USER_AGENT 設定（例："stock-dashboard 你的email"）。
用法：python scripts/fetch_us.py [代號 ...]   （不帶代號就抓整個追蹤清單）
"""
import os
import sys
import time
from datetime import date, timedelta

import requests
import yfinance as yf

from common import DATA, load_json, load_watchlist, log, save_json, today_str, warn

YEARS = 5
SEC_HEADERS = {"User-Agent": os.environ.get("SEC_USER_AGENT") or "stock-dashboard personal-research"}
FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A"}

# 依序嘗試，同一季以排在前面的標籤為準（各公司、各年度用的標籤不同）
TAGS = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
                "RevenueFromContractWithCustomerIncludingAssessedTax"],
    "gross_profit": ["GrossProfit"],
    "cost": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss"],
    "eps": ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
}


def years_ago(n):
    t = date.today()
    try:
        return t.replace(year=t.year - n)
    except ValueError:  # 2/29
        return t.replace(year=t.year - n, day=28)


# ---------- SEC ----------

def sec_get(url):
    time.sleep(0.2)  # SEC 限制每秒 10 次
    r = requests.get(url, headers=SEC_HEADERS, timeout=60)
    if r.status_code == 403:
        raise RuntimeError("SEC 拒絕連線（403），請設定環境變數 SEC_USER_AGENT，格式：「名稱 email」")
    r.raise_for_status()
    return r.json()


_cik_map = None


def cik_of(ticker):
    global _cik_map
    if _cik_map is None:
        _cik_map = {v["ticker"].upper(): v["cik_str"] for v in sec_get("https://www.sec.gov/files/company_tickers.json").values()}
    cik = _cik_map.get(ticker.upper())
    if not cik:
        raise RuntimeError("SEC 查無此代號")
    return cik


def d(s):
    return date.fromisoformat(s)


def quarterly_values(gaap, tag):
    """回傳 {季末日: 單季數值}。第 4 季 10-K 只報全年，用「全年 − 前三季累計」推算。"""
    if tag not in gaap:
        return {}
    units = gaap[tag]["units"]
    rows = units.get("USD") or units.get("USD/shares") or []
    span = {}  # (start, end) -> (filed, val)，同一期間以最新申報為準（含更正）
    for r in rows:
        if r.get("form") not in FORMS or not r.get("start"):
            continue
        key = (r["start"], r["end"])
        if key not in span or r["filed"] > span[key][0]:
            span[key] = (r["filed"], r["val"])
    q = {}
    for (s, e), (_, v) in span.items():
        if 80 <= (d(e) - d(s)).days <= 100:
            q[e] = v
    for (s, e), (_, v) in span.items():
        if 350 <= (d(e) - d(s)).days <= 380 and e not in q:
            # 同一個會計年度起點、約 9 個月的累計數
            ytd = [(e2, v2) for (s2, e2), (_, v2) in span.items()
                   if s2 == s and 260 <= (d(e2) - d(s2)).days <= 285]
            if ytd:
                q[e] = v - max(ytd)[1]
    return q


def merged(gaap, key):
    out = {}
    for tag in reversed(TAGS[key]):  # 優先順序高的最後寫入
        out.update(quarterly_values(gaap, tag))
    return out


def calendar_quarter(end):
    """季末日對齊最近的日曆季末（NVIDIA 4/26 結束的那季算 Q1，與 SEC frame 相同）。"""
    e = d(end)
    cands = [date(e.year - 1, 12, 31)] + [date(e.year, m, dd) for m, dd in ((3, 31), (6, 30), (9, 30), (12, 31))]
    best = min(cands, key=lambda c: abs((c - e).days))
    return f"{best.year}Q{(best.month - 1) // 3 + 1}"


def fiscal_label(end, fy_ends):
    """財報季，例：FY2027 Q1。fy_ends 是已知的會計年度結束日（由年報推得）。"""
    e = d(end)
    if not fy_ends:
        return None
    later = [f for f in fy_ends if f >= e - timedelta(days=5)]
    if later:
        fye = min(later)
    else:
        # 還沒有年報的年度：會計年度結束日每年約同一天（52/53 週制差幾天），從最後一份往後推
        fye = max(fy_ends)
        while fye < e - timedelta(days=5):
            fye = date(fye.year + 1, fye.month, min(fye.day, 28))
    q = 4 - round((fye - e).days / 91.3)
    return f"FY{fye.year} Q{q}"


def fetch_quarterly(cik):
    facts = sec_get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
    gaap = facts["facts"].get("us-gaap", {})
    vals = {k: merged(gaap, k) for k in TAGS}
    # 沒有毛利標籤的公司：營收 − 營業成本
    for e, rev in vals["revenue"].items():
        if e not in vals["gross_profit"] and e in vals["cost"]:
            vals["gross_profit"][e] = rev - vals["cost"][e]
    fy_ends = set()
    for tag in TAGS["revenue"] + TAGS["net_income"]:
        for r in (gaap.get(tag, {}).get("units", {}).get("USD") or []):
            if r.get("form") in FORMS and r.get("start") and 350 <= (d(r["end"]) - d(r["start"])).days <= 380:
                fy_ends.add(d(r["end"]))
    cutoff = years_ago(YEARS).isoformat()
    out = []
    for e in sorted(x for x in vals["revenue"] if x >= cutoff):
        eps = vals["eps"].get(e)
        out.append({
            "period": calendar_quarter(e),
            "fiscal": fiscal_label(e, fy_ends),
            "end": e,
            "revenue": vals["revenue"].get(e),
            "gross_profit": vals["gross_profit"].get(e),
            "operating_income": vals["operating_income"].get(e),
            "net_income": vals["net_income"].get(e),
            "eps": round(eps, 4) if eps is not None else None,  # Q4 為推算值
        })
    return out


def annual_report_url(cik):
    s = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    rec = s["filings"]["recent"]
    for i, form in enumerate(rec["form"]):
        if form == "10-K":
            acc = rec["accessionNumber"][i].replace("-", "")
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{rec['primaryDocument'][i]}"
    return f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K"


# ---------- Yahoo Finance ----------

def fetch_price(tk, old):
    """日 K：已有資料就只補最後一天（含）之後的。保留最近 YEARS 年。價格已做分割調整、未做股利調整。"""
    p = (old or {}).get("price") or {}
    rows = {}
    if p.get("dates"):
        for i, dt in enumerate(p["dates"]):
            rows[dt] = (p["open"][i], p["high"][i], p["low"][i], p["close"][i], p["volume"][i])
        start = p["dates"][-1]
    else:
        start = years_ago(YEARS).isoformat()
    h = tk.history(start=start, auto_adjust=False)
    if h.empty and not rows:
        raise RuntimeError("Yahoo 沒有回傳股價")
    for ts, r in h.iterrows():
        if r["Close"] > 0:
            rows[ts.date().isoformat()] = (round(float(r["Open"]), 4), round(float(r["High"]), 4),
                                           round(float(r["Low"]), 4), round(float(r["Close"]), 4), int(r["Volume"]))
    keep = sorted(x for x in rows if x >= years_ago(YEARS).isoformat())
    return {
        "dates": keep,
        "open": [rows[x][0] for x in keep],
        "high": [rows[x][1] for x in keep],
        "low": [rows[x][2] for x in keep],
        "close": [rows[x][3] for x in keep],
        "volume": [rows[x][4] for x in keep],  # 股數
    }


def fetch_valuation(tk):
    info = tk.info or {}

    def num(k, scale=1):
        v = info.get(k)
        return round(v * scale, 2) if isinstance(v, (int, float)) else None

    return {
        "pe": num("trailingPE"),
        "pb": num("priceToBook"),
        "dividend_yield": num("trailingAnnualDividendYield", 100),  # 近 12 個月現金股利 ÷ 股價，與台股定義相同
        "date": today_str(),
    }


def fetch_dividends(tk):
    """依除息日的日曆年加總（美股沒有台股「所屬年度」的概念）。"""
    first = date.today().year - YEARS
    by = {}
    for ts, v in tk.dividends.items():
        if ts.year >= first:
            by[ts.year] = by.get(ts.year, 0) + float(v)
    return [{"year": y, "cash": round(by[y], 4), "stock": 0} for y in sorted(by)]


# ---------- 主程式 ----------

def update_stock(item):
    ticker = item["ticker"].upper()
    path = DATA / "us" / f"{ticker}.json"
    old = load_json(path)
    cik = cik_of(ticker)
    quarterly = fetch_quarterly(cik)
    report = annual_report_url(cik)

    tk = yf.Ticker(ticker)
    try:
        price = fetch_price(tk, old)
        valuation = fetch_valuation(tk)
        dividends = fetch_dividends(tk)
    except Exception as e:
        # Yahoo 偶爾擋 GitHub Actions 的連線：沿用舊資料，財報照常更新
        if not old:
            raise
        warn(f"{ticker} Yahoo 失敗，沿用舊的股價資料：{e}")
        price, valuation, dividends = old["price"], old["valuation"], old["dividends"]
    if not price["dates"]:
        raise RuntimeError("查無股價，請檢查 watchlist 的代號")

    data = {
        "symbol": ticker,
        "name": item["name"],
        "market": "US",
        "exchange": item.get("exchange", "NASDAQ"),
        "updated": today_str(),
        "price": price,
        "valuation": valuation,
        "monthly_revenue": [],
        "quarterly": quarterly,
        "dividends": dividends,
        "reports": {"annual_report_url": report},
    }
    save_json(path, data)
    last = quarterly[-1] if quarterly else {}
    log(f"  {ticker} {item['name']}：股價 {len(price['dates'])} 天（到 {price['dates'][-1]}）、"
        f"季報 {len(quarterly)} 季（最新 {last.get('period')} / {last.get('fiscal')}）、股利 {len(dividends)} 年")


def main(argv):
    items = load_watchlist().get("us", [])
    if argv:
        want = {a.upper() for a in argv}
        items = [x for x in items if x["ticker"].upper() in want]
    log(f"美股：{len(items)} 檔")
    failed = []
    for item in items:
        try:
            update_stock(item)
        except Exception as e:  # 單檔失敗不中斷
            warn(f"{item['ticker']} 失敗：{e}")
            failed.append(item["ticker"])
    log(f"完成：成功 {len(items) - len(failed)}、失敗 {len(failed)}" + (f"（{', '.join(failed)}）" if failed else ""))
    return 1 if items and len(failed) == len(items) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
