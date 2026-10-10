"""美股選股欄位（LAYOUT-SPEC 第 7 步）：EPS（近四季）、EPS 成長、本益比、PEG、營收成長、自由現金流率、Rule of 40。
輸出 data/screener-us.json。

資料：SEC XBRL frames API（一次拿全部公司某一季／某一年的同一個會計科目），約 40 個請求：
  每股盈餘    EarningsPerShareDiluted（沒有就用 Basic）          每季（3 個月）＋每年
  營收        RevenueFromContractWithCustomerExcludingAssessedTax、Revenues、SalesRevenueNet、…  每季＋每年
  營業現金流  NetCashProvidedByUsedInOperatingActivities        每年
  資本支出    PaymentsToAcquirePropertyPlantAndEquipment        每年
10-K 通常不單獨報第四季，缺的那一季用「全年 − 其他三季」補。
股價用 data/all/us_stocks.json（Nasdaq 選股器），代號對照 CIK 用 data/stocklist.json。
需要環境變數 SEC_USER_AGENT（SEC 規定要有聯絡方式）。
"""
import json
import os
import sys
import time
from datetime import date, timedelta

import requests

from common import DATA, load_json, log, today_str, warn

FIELDS = ["code", "eps_ttm", "eps_prev", "eps_growth", "pe", "peg", "rev_ttm", "rev_growth", "fcf_margin", "rule40", "period"]
EPS = [("EarningsPerShareDiluted", "USD-per-shares"), ("EarningsPerShareBasic", "USD-per-shares")]
REV = [("RevenueFromContractWithCustomerExcludingAssessedTax", "USD"), ("Revenues", "USD"), ("SalesRevenueNet", "USD"),
       ("RevenueFromContractWithCustomerIncludingAssessedTax", "USD")]
OCF = [("NetCashProvidedByUsedInOperatingActivities", "USD")]
CAPEX = [("PaymentsToAcquirePropertyPlantAndEquipment", "USD")]

s = requests.Session()


def frame(concept, unit, label):
    url = f"https://data.sec.gov/api/xbrl/frames/us-gaap/{concept}/{unit}/{label}.json"
    for attempt in range(3):
        try:
            r = s.get(url, timeout=90)
            time.sleep(0.15)  # SEC：每秒最多 10 個請求
            if r.status_code == 404:
                return []
            r.raise_for_status()
            return r.json().get("data", [])
        except Exception as e:
            if attempt == 2:
                warn(f"{concept} {label} 失敗：{e}")
                return []
            time.sleep(3)


def qlabel(d):
    """期末日 → 所屬日曆季（往前 15 天再算，避免 10/04 這種跨季的期末）"""
    d = date.fromisoformat(d) - timedelta(days=15)
    return d.year * 4 + (d.month - 1) // 3  # 數字，方便加減


def lab_str(n):
    return f"CY{n // 4}Q{n % 4 + 1}"


def collect(concepts, labels, years):
    """{cik: {"q": {季號: 值}, "y": [(start, end, 值)]}}；多個科目時，同一季取第一個有值的科目"""
    out = {}
    for concept, unit in concepts:
        for lb in labels:
            for x in frame(concept, unit, lab_str(lb)):
                c = out.setdefault(x["cik"], {"q": {}, "y": []})
                c["q"].setdefault(qlabel(x["end"]), x["val"])
        for y in years:
            for x in frame(concept, unit, f"CY{y}"):
                c = out.setdefault(x["cik"], {"q": {}, "y": []})
                if not any(e == x["end"] for _, e, _ in c["y"]):
                    c["y"].append((x["start"], x["end"], x["val"]))
    # 補第四季（或任何缺的一季）：全年 − 同一年的其他三季
    for c in out.values():
        for _, end, val in c["y"]:
            last = qlabel(end)
            slots = [last - i for i in range(4)]
            have = [q for q in slots if q in c["q"]]
            if len(have) == 3:
                miss = next(q for q in slots if q not in c["q"])
                c["q"][miss] = val - sum(c["q"][q] for q in have)
    return out


def ttm(c, end):
    vals = [c["q"].get(end - i) for i in range(4)]
    return sum(vals) if all(v is not None for v in vals) else None


def r2(x):
    return None if x is None else round(x, 2)


def main():
    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if not ua:
        warn("沒有設定 SEC_USER_AGENT，略過美股選股欄位")
        return 1
    s.headers["User-Agent"] = ua
    us = load_json(DATA / "all" / "us_stocks.json")
    sl = load_json(DATA / "stocklist.json")
    if not us or not sl:
        warn("缺 data/all/us_stocks.json 或 data/stocklist.json")
        return 1
    fi = {f: i for i, f in enumerate(us["fields"])}
    price = {r[fi["code"]]: r[fi["close"]] for r in us["rows"]}
    cik_of = {}
    for row in sl.get("us", []):
        if len(row) > 3 and row[3]:
            cik_of.setdefault(int(row[3]), row[0])

    # 最新一季：從今天往回找，有 2000 家以上公布的那一季
    now = qlabel(date.today().isoformat()) + 1
    latest = None
    for lb in range(now, now - 4, -1):
        n = len(frame(EPS[0][0], EPS[0][1], lab_str(lb)))
        if n >= 2000:
            latest = lb
            break
    if latest is None:
        warn("找不到最新一季的 EPS")
        return 1
    labels = list(range(latest - 11, latest + 1))          # 近 12 季（去年的近四季要往前三年補第四季）
    years = [latest // 4 - 2, latest // 4 - 1, latest // 4]  # 補第四季、算自由現金流用
    log(f"美股：最新一季 {lab_str(latest)}，抓 {lab_str(labels[0])}～{lab_str(labels[-1])}、年度 {years}")
    eps = collect(EPS, labels, years)
    rev = collect(REV, labels, years)
    ocf = collect(OCF, [], years)
    capex = collect(CAPEX, [], years)

    rows = []
    for cik, code in cik_of.items():
        if code not in price:
            continue
        e = eps.get(cik)
        rv = rev.get(cik)
        # 這家公司最新的一季（最多比全市場最新晚一季）
        end = max((q for q in (e or {"q": {}})["q"] if q <= latest), default=None)
        if end is not None and end < latest - 1:
            end = None
        et = ttm(e, end) if e and end is not None else None
        ep = ttm(e, end - 4) if e and end is not None else None
        rt = ttm(rv, end) if rv and end is not None else None
        rp = ttm(rv, end - 4) if rv and end is not None else None
        px = price.get(code)
        pe = r2(px / et) if px and et and et > 0 else None
        g = r2((et / ep - 1) * 100) if et and ep and et > 0 and ep > 0 else None
        peg = r2(pe / g) if pe and g and 0 < g <= 100 else None
        rg = r2((rt / rp - 1) * 100) if rt and rp and rp > 0 else None
        # 自由現金流率：最近一個會計年度（營業現金流 − 資本支出）÷ 同年度營收
        fm = None
        o, cx = ocf.get(cik), capex.get(cik)
        if o and o["y"]:
            st, en, ov = max(o["y"], key=lambda x: x[1])
            cv = next((v for a, b, v in (cx or {"y": []})["y"] if b == en), 0)
            rev_y = next((v for a, b, v in (rv or {"y": []})["y"] if b == en), None)
            if rev_y is None and rv:
                rev_y = ttm(rv, qlabel(en))  # 年度營收沒有就用同一年的四季加總
            if rev_y and rev_y > 0:
                fm = r2((ov - cv) / rev_y * 100)
        r40 = r2(rg + fm) if rg is not None and fm is not None else None
        if any(v is not None for v in (et, rt, fm)):
            rows.append([code, r2(et), r2(ep), g, pe, peg, int(rt) if rt else None, rg, fm, r40, lab_str(end) if end is not None else None])
    rows.sort(key=lambda r: r[0])
    out = DATA / "screener-us.json"
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(today_str()) + ',"quarter":' + json.dumps(lab_str(latest)) + ',"fields":' + json.dumps(FIELDS) + ',"rows":[\n')
        f.write(",\n".join(json.dumps(r, separators=(",", ":")) for r in rows))
        f.write("\n]}\n")
    log(f"screener-us.json：{len(rows)} 檔（有 EPS {sum(1 for r in rows if r[1] is not None)}、有 Rule of 40 {sum(1 for r in rows if r[9] is not None)}），{out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
