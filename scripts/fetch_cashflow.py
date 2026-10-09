"""全台股現金流量（輪流更新），輸出 data/all/cashflow.json，給 build_all.py 算近四季現金流指標。

證交所／櫃買中心的批次 OpenAPI 沒有現金流量表，只能用 FinMind 逐檔抓（TaiwanStockCashFlowsStatement）。
現金流量每季才變，所以每次只抓「最久沒更新」的一批（預設 450 檔），約 4～5 天輪完全部；
FinMind 有 token 時每小時 600 次，沒有時 300 次。

現金流量表是「年初至今累計」：近四季＝今年累計＋去年全年－去年同期累計。
輸出：{代號: {"fetched": "2026-10-10", "q": {"2026Q2": [營業現金流, 資本支出], ...}}}（元；資本支出為負數）
用法：python scripts/fetch_cashflow.py [批次數量] [代號 ...]
"""
import json
import os
import sys
import time
from datetime import date

import requests

from common import DATA, load_json, log, today_str, warn

PATH = DATA / "all" / "cashflow.json"
API = "https://api.finmindtrade.com/api/v4/data"
CFO = ("CashFlowsFromOperatingActivities", "NetCashInflowFromOperatingActivities")
CAPEX = "PropertyAndPlantAndEquipment"  # 取得不動產、廠房及設備（負數）

session = requests.Session()
if os.environ.get("FINMIND_TOKEN"):
    session.headers["Authorization"] = "Bearer " + os.environ["FINMIND_TOKEN"]


def fetch(code):
    start = f"{date.today().year - 3}-01-01"  # 要有去年全年＋去年同期，抓近 3 年
    r = session.get(API, params={"dataset": "TaiwanStockCashFlowsStatement", "data_id": code, "start_date": start}, timeout=60)
    body = r.json()
    if body.get("status") != 200:
        raise RuntimeError(body.get("msg") or r.status_code)
    q = {}
    for x in body["data"]:
        y, m = int(x["date"][:4]), int(x["date"][5:7])
        key = f"{y}Q{(m - 1) // 3 + 1}"
        v = q.setdefault(key, [None, None])
        if x["type"] in CFO and v[0] is None:
            v[0] = x["value"]
        elif x["type"] == CAPEX:
            v[1] = x["value"]
    return q


def main(argv):
    batch = int(argv[0]) if argv and argv[0].isdigit() else 450
    only = [a for a in argv if not a.isdigit()]
    cache = load_json(PATH) or {}
    stocks = load_json(DATA / "all" / "stocks.json")
    if only:
        codes = only
    else:
        if not stocks:
            warn("沒有 data/all/stocks.json，先跑 build_all.py")
            return 1
        ci = stocks["fields"].index("code")
        universe = [r[ci] for r in stocks["rows"]]
        # 從沒抓過的優先，其次是最久沒更新的
        codes = sorted(universe, key=lambda c: (cache.get(c, {}).get("fetched") or ""))[:batch]
    log(f"現金流量：本次更新 {len(codes)} 檔（快取共 {len(cache)} 檔）" + ("（使用 FINMIND_TOKEN）" if "Authorization" in session.headers else ""))
    ok = fail = 0
    for i, code in enumerate(codes):
        try:
            time.sleep(0.5)
            cache[code] = {"fetched": today_str(), "q": fetch(code)}
            ok += 1
        except Exception as e:
            fail += 1
            msg = str(e)
            if "limit" in msg.lower() or "上限" in msg or "402" in msg:  # 額度用完：先存檔，下次再繼續
                warn(f"FinMind 額度用完，已更新 {ok} 檔，其餘下次繼續：{msg}")
                break
            warn(f"{code} 失敗：{msg}")
        if (i + 1) % 100 == 0:
            log(f"  已處理 {i + 1} 檔")
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"完成：成功 {ok}、失敗 {fail}，快取 {len(cache)} 檔，{PATH.stat().st_size // 1024} KB")
    return 0


def ttm(q):
    """近四季（營業現金流, 資本支出, 最新季別）；資料不夠回傳 None。"""
    if not q:
        return None
    latest = max(q, key=lambda k: (int(k[:4]), int(k[5:])))
    y, n = int(latest[:4]), int(latest[5:])
    cur = q[latest]
    if cur[0] is None:
        return None
    if n == 4:
        cfo, capex = cur[0], cur[1] or 0
    else:
        full, same = q.get(f"{y - 1}Q4"), q.get(f"{y - 1}Q{n}")
        if not full or not same or full[0] is None or same[0] is None:
            return None
        cfo = cur[0] + full[0] - same[0]
        capex = (cur[1] or 0) + (full[1] or 0) - (same[1] or 0)
    return cfo, capex, latest


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
