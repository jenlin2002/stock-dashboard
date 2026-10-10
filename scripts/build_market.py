"""大盤資料，輸出 data/market.json（大盤頁 market.html 用）。資料來源 FinMind：

  TaiwanStockPrice (TAIEX)                 加權指數日 K＋成交金額
  TaiwanStockPrice (TPEx)                  櫃買指數日 K＋成交金額
  TaiwanFuturesDaily (TX)                  台指期日 K：一般交易時段、每天取成交量最大的單一月份契約（主力）
  TaiwanStockTotalInstitutionalInvestors   三大法人現貨買賣超（全市場金額）
  TaiwanStockTotalMarginPurchaseShortSale  融資餘額（金額）、融券餘額（張）
  TaiwanFuturesInstitutionalInvestors (TX) 三大法人台指期未平倉（口）

增量更新：已有的資料只從最後一天前 7 天起重抓；K 線保留 5 年，其他保留 1 年。
"""
import json
import os
import sys
import time
from datetime import date, timedelta

import requests

from common import DATA, load_json, log, save_json, today_str, warn

API = "https://api.finmindtrade.com/api/v4/data"
PATH = DATA / "market.json"
YEARS = 5

session = requests.Session()
if os.environ.get("FINMIND_TOKEN"):
    session.headers["Authorization"] = "Bearer " + os.environ["FINMIND_TOKEN"]


def fm(dataset, start, data_id=None):
    time.sleep(1)
    params = {"dataset": dataset, "start_date": start}
    if data_id:
        params["data_id"] = data_id
    r = session.get(API, params=params, timeout=120)
    body = r.json()
    if body.get("status") != 200:
        raise RuntimeError(f"{dataset} {data_id or ''}：{body.get('msg') or r.status_code}")
    return body["data"]


def ago(days):
    return (date.today() - timedelta(days=days)).isoformat()


def start_from(old_dates, keep_days):
    """有舊資料就從最後一天前 7 天開始重抓，沒有就抓 keep_days 天。"""
    return (date.fromisoformat(old_dates[-1]) - timedelta(days=7)).isoformat() if old_dates else ago(keep_days)


def merge_series(old, rows, keep_days):
    """K 線：{dates, open, high, low, close, volume[, oi]} 依日期合併、排序、只留 keep_days 天。"""
    keys = [k for k in ("open", "high", "low", "close", "volume", "oi") if k in (rows[0] if rows else old or {})]
    by = {}
    if old:
        for i, d in enumerate(old["dates"]):
            by[d] = {k: old[k][i] for k in keys if k in old}
    for r in rows:
        by[r["date"]] = r
    cut = ago(keep_days)
    dates = sorted(d for d in by if d >= cut)
    return dict({"dates": dates}, **{k: [by[d].get(k) for d in dates] for k in keys})


def index_series(old, data_id):
    rows = fm("TaiwanStockPrice", start_from((old or {}).get("dates"), YEARS * 366), data_id)
    rows = [{"date": r["date"], "open": r["open"], "high": r["max"], "low": r["min"], "close": r["close"],
             "volume": r["Trading_money"]} for r in rows if r["close"]]  # volume＝成交金額（元）
    return merge_series(old, rows, YEARS * 366)


def tx_series(old):
    rows = fm("TaiwanFuturesDaily", start_from((old or {}).get("dates"), YEARS * 366), "TX")
    best = {}
    for r in rows:
        # 一般交易時段（position）、單一月份契約（排除 202610/202611 這種價差組合）
        if r["trading_session"] != "position" or "/" in r["contract_date"] or not r["close"]:
            continue
        b = best.get(r["date"])
        if not b or r["volume"] > b["volume"]:
            best[r["date"]] = r
    out = [{"date": d, "open": r["open"], "high": r["max"], "low": r["min"], "close": r["close"],
            "volume": r["volume"], "oi": r["open_interest"]} for d, r in best.items()]
    s = merge_series(old, out, YEARS * 366)
    s["contract"] = best[max(best)]["contract_date"] if best else (old or {}).get("contract")
    return s


def merge_rows(old, new, keep_days):
    by = {r["date"]: r for r in (old or [])}
    by.update({r["date"]: r for r in new})
    cut = ago(keep_days)
    return [by[d] for d in sorted(by) if d >= cut]


def institutional(old):
    """三大法人現貨買賣超（元）：外資＝外資＋外資自營商；自營商＝自行買賣＋避險。"""
    rows = fm("TaiwanStockTotalInstitutionalInvestors", start_from([r["date"] for r in old or []], 366))
    by = {}
    group = {"Foreign_Investor": "foreign", "Foreign_Dealer_Self": "foreign", "Investment_Trust": "trust",
             "Dealer_self": "dealer", "Dealer_Hedging": "dealer"}
    for r in rows:
        g = group.get(r["name"])
        if g:
            d = by.setdefault(r["date"], {"date": r["date"], "foreign": 0, "trust": 0, "dealer": 0})
            d[g] += r["buy"] - r["sell"]
    return merge_rows(old, list(by.values()), 366)


def margin(old):
    """融資餘額（元）、融券餘額（張）"""
    rows = fm("TaiwanStockTotalMarginPurchaseShortSale", start_from([r["date"] for r in old or []], 366))
    by = {}
    for r in rows:
        d = by.setdefault(r["date"], {"date": r["date"]})
        if r["name"] == "MarginPurchaseMoney":
            d["margin"] = r["TodayBalance"]
        elif r["name"] == "ShortSale":
            d["short"] = r["TodayBalance"]
    return merge_rows(old, [d for d in by.values() if "margin" in d], 366)


def futures_oi(old):
    """三大法人台指期未平倉淨口數（多單 − 空單）"""
    rows = fm("TaiwanFuturesInstitutionalInvestors", start_from([r["date"] for r in old or []], 366), "TX")
    name = {"外資": "foreign", "投信": "trust", "自營商": "dealer"}
    by = {}
    for r in rows:
        k = name.get(r["institutional_investors"])
        if k:
            d = by.setdefault(r["date"], {"date": r["date"]})
            d[k] = r["long_open_interest_balance_volume"] - r["short_open_interest_balance_volume"]
    return merge_rows(old, list(by.values()), 366)


def main():
    old = load_json(PATH) or {}
    out = {"updated": today_str()}
    steps = [("taiex", lambda o: index_series(o, "TAIEX")), ("otc", lambda o: index_series(o, "TPEx")), ("tx", tx_series),
             ("inst", institutional), ("margin", margin), ("fut_oi", futures_oi)]
    ok = 0
    for key, fn in steps:
        try:
            out[key] = fn(old.get(key))
            ok += 1
        except Exception as e:  # 一項失敗就沿用舊資料
            warn(f"{key} 失敗，沿用舊資料：{e}")
            out[key] = old.get(key)
    save_json(PATH, out)
    t = out.get("taiex") or {}
    log(f"market.json：加權 {len((t or {}).get('dates', []))} 天（到 {(t.get('dates') or ['—'])[-1]}）、"
        f"台指期主力 {(out.get('tx') or {}).get('contract')}、法人 {len(out.get('inst') or [])} 天、成功 {ok}/{len(steps)} 項")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
