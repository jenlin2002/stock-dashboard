"""產生 data/stocklist.json：所有台股（上市、上櫃）與美股（Nasdaq、NYSE、CBOE）的代號與名稱，給搜尋框用。

格式（陣列，省空間）：
  {"updated": "2026-10-09",
   "tw": [["2330", "台積電", "TWSE", "半導體業"], ...],
   "us": [["AAPL", "Apple Inc.", "NASDAQ", 320193], ...]}   # 最後一欄是 SEC 的 CIK
"""
import json
import os
import sys

import requests

from common import DATA, log, today_str, warn

US_EXCHANGES = {"Nasdaq": "NASDAQ", "NYSE": "NYSE", "CBOE": "CBOE"}


def taiwan():
    headers = {}
    if os.environ.get("FINMIND_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["FINMIND_TOKEN"]
    r = requests.get("https://api.finmindtrade.com/api/v4/data", params={"dataset": "TaiwanStockInfo"}, headers=headers, timeout=60)
    r.raise_for_status()
    best = {}
    for x in r.json()["data"]:
        if x["type"] not in ("twse", "tpex"):  # 不收興櫃
            continue
        # 同一檔會因產業別列多筆，留日期最新的
        if x["stock_id"] not in best or (x.get("date") or "") > (best[x["stock_id"]].get("date") or ""):
            best[x["stock_id"]] = x
    return [[x["stock_id"], x["stock_name"], "TWSE" if x["type"] == "twse" else "TPEX", x.get("industry_category") or ""]
            for x in sorted(best.values(), key=lambda x: x["stock_id"])]


def us():
    ua = os.environ.get("SEC_USER_AGENT") or "stock-dashboard personal-research"
    r = requests.get("https://www.sec.gov/files/company_tickers_exchange.json", headers={"User-Agent": ua}, timeout=60)
    r.raise_for_status()
    seen, out = set(), []
    for cik, name, ticker, exch in r.json()["data"]:
        if exch in US_EXCHANGES and ticker not in seen:
            seen.add(ticker)
            out.append([ticker, name, US_EXCHANGES[exch], cik])  # cik：即時查詢 SEC 財報用
    return sorted(out)


def main():
    path = DATA / "stocklist.json"
    old = {}
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
    out = {"updated": today_str()}
    for key, fn in (("tw", taiwan), ("us", us)):
        try:
            out[key] = fn()
        except Exception as e:  # 抓不到就沿用舊清單
            warn(f"{key} 股票清單失敗，沿用舊的：{e}")
            out[key] = old.get(key, [])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log(f"stocklist.json：台股 {len(out['tw'])} 檔、美股 {len(out['us'])} 檔，{path.stat().st_size // 1024} KB")
    return 0 if out["tw"] or out["us"] else 1


if __name__ == "__main__":
    sys.exit(main())
