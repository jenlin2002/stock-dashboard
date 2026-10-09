"""抓台股資料，輸出 data/tw/{code}.json。

資料來源：FinMind（https://finmindtrade.com/）
  - TaiwanStockPrice          日 K
  - TaiwanStockMonthRevenue   月營收
  - TaiwanStockFinancialStatements 損益表（單季）
  - TaiwanStockDividend       股利
  - TaiwanStockPER            本益比、股價淨值比、殖利率（上市、上櫃都有）

環境變數 FINMIND_TOKEN 可不設：沒有 token 每小時約 300 次請求，每檔股票用 5 次。
用法：python scripts/fetch_tw.py [代號 ...]   （不帶代號就抓整個追蹤清單）
"""
import os
import re
import sys
import time
from datetime import date, timedelta

import requests

from common import DATA, load_json, load_watchlist, log, pct, save_json, today_str, warn

API = "https://api.finmindtrade.com/api/v4/data"
YEARS = 5
SLEEP = 1.0

session = requests.Session()
if os.environ.get("FINMIND_TOKEN"):
    session.headers["Authorization"] = "Bearer " + os.environ["FINMIND_TOKEN"]


def finmind(dataset, code, start):
    time.sleep(SLEEP)
    r = session.get(API, params={"dataset": dataset, "data_id": code, "start_date": start}, timeout=60)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or body.get("status") != 200:
        raise RuntimeError(f"{dataset} {code}: HTTP {r.status_code} {body.get('msg', r.text[:200])}")
    return body["data"]


def years_ago(n):
    t = date.today()
    try:
        return t.replace(year=t.year - n).isoformat()
    except ValueError:  # 2/29
        return t.replace(year=t.year - n, day=28).isoformat()


# ---------- 各項資料 ----------

def fetch_price(code, old):
    """日 K：已有資料就只補最後一天（含）之後的。保留最近 YEARS 年。"""
    p = (old or {}).get("price") or {}
    rows = {}
    if p.get("dates"):
        for i, d in enumerate(p["dates"]):
            rows[d] = (p["open"][i], p["high"][i], p["low"][i], p["close"][i], p["volume"][i])
        start = p["dates"][-1]
    else:
        start = years_ago(YEARS)
    for r in finmind("TaiwanStockPrice", code, start):
        if r["close"] and r["Trading_Volume"]:  # 停牌日收盤為 0，略過
            rows[r["date"]] = (r["open"], r["max"], r["min"], r["close"], r["Trading_Volume"])
    keep = sorted(d for d in rows if d >= years_ago(YEARS))
    return {
        "dates": keep,
        "open": [rows[d][0] for d in keep],
        "high": [rows[d][1] for d in keep],
        "low": [rows[d][2] for d in keep],
        "close": [rows[d][3] for d in keep],
        "volume": [rows[d][4] for d in keep],  # 股數
    }


def fetch_monthly_revenue(code, old):
    """月營收：已有資料就從最後兩個月重抓（公司偶爾會更正）。多留一年才算得出最早幾個月的 YoY。"""
    rev = {m["month"]: m["revenue"] for m in (old or {}).get("monthly_revenue") or []}
    if rev:
        y, m = map(int, max(rev).split("-"))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        start = f"{y}-{m:02d}-01"
    else:
        start = years_ago(YEARS + 1)
    for r in finmind("TaiwanStockMonthRevenue", code, start):
        # date 是公布月份（例：2026-10-01 公布 9 月營收），以 revenue_year/revenue_month 為準
        rev[f"{r['revenue_year']}-{r['revenue_month']:02d}"] = r["revenue"]
    out = []
    for month in sorted(rev):
        y, m = map(int, month.split("-"))
        prev_m = f"{y}-{m - 1:02d}" if m > 1 else f"{y - 1}-12"
        out.append({
            "month": month,
            "revenue": rev[month],
            "yoy": pct(rev[month], rev.get(f"{y - 1}-{m:02d}")),
            "mom": pct(rev[month], rev.get(prev_m)),
        })
    return out


QUARTER_FIELDS = {
    "Revenue": "revenue",
    "GrossProfit": "gross_profit",
    "OperatingIncome": "operating_income",
    "EquityAttributableToOwnersOfParent": "net_income",  # 歸屬母公司淨利（與 EPS 同基礎）
    "EPS": "eps",
}


def fetch_quarterly(code):
    """損益表（FinMind 給的是單季數字）。資料量小，每次重抓 YEARS 年。"""
    by = {}
    for r in finmind("TaiwanStockFinancialStatements", code, years_ago(YEARS)):
        key = QUARTER_FIELDS.get(r["type"])
        if not key:
            continue
        y, m, _ = r["date"].split("-")
        period = f"{y}Q{(int(m) - 1) // 3 + 1}"
        by.setdefault(period, {"period": period})[key] = r["value"]
    out = []
    for period in sorted(by):
        q = by[period]
        out.append({k: q.get(k) for k in ("period", "revenue", "gross_profit", "operating_income", "net_income", "eps")})
    return out


def fetch_dividends(code):
    """股利依「所屬年度」加總（例：「114年第3季」「114年前半年度」都算 2025 年）。每次重抓。"""
    by = {}
    for r in finmind("TaiwanStockDividend", code, years_ago(YEARS + 1)):
        m = re.match(r"(\d+)", r.get("year") or "")
        if not m:
            continue
        year = int(m.group(1)) + 1911
        d = by.setdefault(year, {"year": year, "cash": 0.0, "stock": 0.0})
        d["cash"] += (r.get("CashEarningsDistribution") or 0) + (r.get("CashStatutorySurplus") or 0)
        d["stock"] += (r.get("StockEarningsDistribution") or 0) + (r.get("StockStatutorySurplus") or 0)
    # 最早一個年度的股利可能有一部分在抓取起點之前發放，加總不完整，所以只留 YEARS 年內的年度
    first = date.today().year - YEARS
    return [{"year": y, "cash": round(by[y]["cash"], 4), "stock": round(by[y]["stock"], 4)} for y in sorted(by) if y >= first]


def fetch_valuation(code):
    rows = finmind("TaiwanStockPER", code, (date.today() - timedelta(days=21)).isoformat())
    if not rows:
        return {"pe": None, "pb": None, "dividend_yield": None, "date": None}
    r = rows[-1]
    return {"pe": r["PER"] or None, "pb": r["PBR"] or None, "dividend_yield": r["dividend_yield"], "date": r["date"]}


def annual_report_url(code):
    """公開資訊觀測站「股東會年報」清單頁。年報約 5 月底前上傳，6 月起才指向去年度。"""
    t = date.today()
    roc = (t.year - 1 if t.month >= 6 else t.year - 2) - 1911
    return f"https://doc.twse.com.tw/server-java/t57sb01?step=1&colorchg=1&co_id={code}&year={roc}&mtype=F"


# ---------- 主程式 ----------

def update_stock(item):
    code = item["code"]
    path = DATA / "tw" / f"{code}.json"
    old = load_json(path)
    price = fetch_price(code, old)
    if not price["dates"]:
        raise RuntimeError("查無股價，請檢查 watchlist 的代號")
    data = {
        "symbol": code,
        "name": item["name"],
        "market": "TW",
        "exchange": item.get("market", "TWSE"),
        "updated": today_str(),
        "price": price,
        "valuation": fetch_valuation(code),
        "monthly_revenue": fetch_monthly_revenue(code, old),
        "quarterly": fetch_quarterly(code),
        "dividends": fetch_dividends(code),
        "reports": {"annual_report_url": annual_report_url(code)},
    }
    save_json(path, data)
    p = data["price"]
    log(f"  {code} {item['name']}：股價 {len(p['dates'])} 天（到 {p['dates'][-1] if p['dates'] else '無'}）、"
        f"月營收 {len(data['monthly_revenue'])} 筆、季報 {len(data['quarterly'])} 季、股利 {len(data['dividends'])} 年")


def main(argv):
    items = load_watchlist().get("tw", [])
    if argv:
        items = [x for x in items if x["code"] in argv]
    log(f"台股：{len(items)} 檔" + ("（使用 FINMIND_TOKEN）" if "Authorization" in session.headers else "（未設定 token）"))
    failed = []
    for item in items:
        try:
            update_stock(item)
        except Exception as e:  # 單檔失敗不中斷
            warn(f"{item['code']} 失敗：{e}")
            failed.append(item["code"])
    log(f"完成：成功 {len(items) - len(failed)}、失敗 {len(failed)}" + (f"（{', '.join(failed)}）" if failed else ""))
    # 全部失敗才回傳錯誤碼，讓 GitHub Actions 顯示紅燈
    return 1 if items and len(failed) == len(items) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
