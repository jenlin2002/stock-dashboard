"""彙整 data/tw/*.json、data/us/*.json 的最新指標，輸出 data/summary.json（首頁、比較頁用）。

只收追蹤清單裡的股票，順序與 watchlist 相同；資料檔不存在的股票略過。
"""
import json
import sys

from common import DATA, load_json, load_watchlist, log, pct, today_str, warn


def ratio(a, b):
    """a / b（%），缺值時回傳 None。"""
    if a is None or not b:
        return None
    return round(a / b * 100, 2)


def summarize(d):
    p = d["price"]
    close = p["close"]
    q = d.get("quarterly") or []
    last_q = q[-1] if q else {}
    last4 = [x.get("eps") for x in q[-4:]]
    rev = d.get("monthly_revenue") or []
    last_m = rev[-1] if rev else {}
    v = d.get("valuation") or {}
    return {
        "symbol": d["symbol"],
        "name": d["name"],
        "market": d["market"],
        "exchange": d.get("exchange"),
        "updated": d.get("updated"),
        "price_date": p["dates"][-1] if p["dates"] else None,
        "price": close[-1] if close else None,
        "change_pct": pct(close[-1], close[-2]) if len(close) >= 2 else None,
        "pe": v.get("pe"),
        "pb": v.get("pb"),
        "dividend_yield": v.get("dividend_yield"),
        "revenue_month": last_m.get("month"),
        "revenue_yoy": last_m.get("yoy"),
        "quarter": last_q.get("period"),
        "eps_ttm": round(sum(last4), 2) if len(last4) == 4 and None not in last4 else None,
        "gross_margin": ratio(last_q.get("gross_profit"), last_q.get("revenue")),
        "operating_margin": ratio(last_q.get("operating_income"), last_q.get("revenue")),
    }


def main():
    w = load_watchlist()
    stocks = []
    for market, key in (("tw", "code"), ("us", "ticker")):
        for item in w.get(market, []):
            sym = item[key].upper() if market == "us" else item[key]
            d = load_json(DATA / market / f"{sym}.json")
            if not d or not d.get("price", {}).get("dates"):
                warn(f"{sym} 沒有資料檔，略過")
                continue
            stocks.append(summarize(d))
    out = {"updated": today_str(), "stocks": stocks}
    path = DATA / "summary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write('{\n  "updated": ' + json.dumps(out["updated"]) + ',\n  "stocks": [\n')
        f.write(",\n".join("    " + json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in stocks))
        f.write("\n  ]\n}\n")
    log(f"summary.json：{len(stocks)} 檔")
    return 0


if __name__ == "__main__":
    sys.exit(main())
