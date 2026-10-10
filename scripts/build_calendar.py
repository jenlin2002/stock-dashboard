"""行事曆（LAYOUT-SPEC 第 7 步）：輸出 data/calendar.json，範圍＝7 天前到 60 天後。
  除權息    證交所 OpenAPI exchangeReport/TWT48U_ALL、櫃買 OpenAPI tpex_exright_prepost（預告表）
  法說會    公開資訊觀測站 t100sb02_1（上市 sii、上櫃 otc；本月和下個月）
  財報、營收 固定日期：每月 10 日前公布上月營收；財報截止 Q1 5/15、Q2 8/14、Q3 11/14、年報 3/31
  台指期結算 每月第三個星期三
  總經      FOMC 利率決策會議（Fed 公布的 2026 年日程，寫在下面；之後的年份要補上）
只收全台股總表裡的普通股（不含 ETF）。格式：{"updated", "events": [{"date", "type", "title", "code"?}]}
"""
import json
import re
import sys
import time
from datetime import date, timedelta

import requests

from common import DATA, load_json, log, today_str, warn

# Fed 公布的 FOMC 會議（第二天公布利率決策）：https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
FOMC = {2026: ["01-28", "03-18", "04-29", "06-17", "07-29", "09-16", "10-28", "12-09"]}

s = requests.Session()
s.headers["User-Agent"] = "Mozilla/5.0 (stock-dashboard)"


def get_json(url):
    for attempt in range(3):
        try:
            r = s.get(url, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == 2:
                warn(f"{url} 失敗：{e}")
                return []
            time.sleep(3)


def roc(d):
    """'1151008' 或 '115/10/08' → date"""
    t = re.sub(r"\D", "", str(d or ""))
    if len(t) < 7:
        return None
    try:
        return date(int(t[:-4]) + 1911, int(t[-4:-2]), int(t[-2:]))
    except ValueError:
        return None


def num(x):
    try:
        return float(str(x).replace(",", ""))
    except ValueError:
        return None


def third_wednesday(y, m):
    d = date(y, m, 1)
    d += timedelta(days=(2 - d.weekday()) % 7)
    return d + timedelta(days=14)


def main():
    stocks = load_json(DATA / "all" / "stocks.json") or {"rows": []}
    names = {r[0]: r[1] for r in stocks["rows"]}
    today = date.today()
    lo, hi = today - timedelta(days=7), today + timedelta(days=60)
    ev = []

    def add(d, typ, title, code=None):
        if d and lo <= d <= hi:
            e = {"date": d.isoformat(), "type": typ, "title": title}
            if code:
                e["code"] = code
            ev.append(e)

    # ---- 除權息預告 ----
    def div_title(name, kind, cash, stock):
        parts = []
        if cash:
            parts.append(f"現金 {round(cash, 4):g} 元")
        if stock:
            parts.append(f"每股配 {round(stock, 4):g} 股")
        return f"{name} {kind}" + ("（" + "、".join(parts) + "）" if parts else "")
    for x in get_json("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL") or []:
        code = str(x.get("Code", "")).strip()
        if code in names:
            k = str(x.get("Exdividend", "")).strip()
            add(roc(x.get("Date")), "除息", div_title(names[code], "除權息" if k == "權息" else "除權" if k == "權" else "除息", num(x.get("CashDividend")), num(x.get("StockDividendRatio"))), code)
    for x in get_json("https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost") or []:
        code = str(x.get("SecuritiesCompanyCode", "")).strip()
        if code in names:
            k = str(x.get("ExRrightsExDividend", "")).strip()
            add(roc(x.get("ExRrightsExDividendDate")), "除息", div_title(names[code], k or "除息", num(x.get("CashDividend")), num(x.get("StockDividendRatio"))), code)

    # ---- 法說會（本月、下個月） ----
    months = {(today.year, today.month), ((today.replace(day=28) + timedelta(days=5)).year, (today.replace(day=28) + timedelta(days=5)).month)}
    for y, m in sorted(months):
        for typek in ("sii", "otc"):
            try:
                r = s.post("https://mopsov.twse.com.tw/mops/web/ajax_t100sb02_1",
                           data={"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "TYPEK": typek, "year": str(y - 1911), "month": f"{m:02d}", "co_id": ""}, timeout=60)
                r.encoding = "utf-8"
                for row in re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S):
                    c = [re.sub(r"<[^>]+>|\s+", " ", x).strip() for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
                    if len(c) >= 4 and re.fullmatch(r"\d{4}[A-Z]?", c[0]) and c[0] in names:
                        add(roc(c[2]), "法說", f"{names[c[0]]} 法說會 {c[3]}", c[0])
            except Exception as e:
                warn(f"法說會 {y}-{m:02d} {typek} 失敗：{e}")
            time.sleep(3)

    # ---- 固定日期 ----
    d = lo.replace(day=1)
    while d <= hi:
        y, m = d.year, d.month
        add(date(y, m, 10), "營收", "上市櫃公司公布上月營收截止")
        add(third_wednesday(y, m), "期貨", "台指期、台指選擇權結算日")
        for mm, dd, label in ((3, 31, "年報"), (5, 15, "第一季財報"), (8, 14, "第二季財報"), (11, 14, "第三季財報")):
            if m == mm:
                add(date(y, mm, dd), "財報", f"{label}公告截止")
        d = (d.replace(day=28) + timedelta(days=5)).replace(day=1)
    for y, days in FOMC.items():
        for md in days:
            add(date(y, int(md[:2]), int(md[3:])), "總經", "美國 FOMC 利率決策（台灣時間隔天凌晨公布）")
    if not FOMC.get(today.year) and not FOMC.get(today.year + 1):
        warn("FOMC 日程只寫到 " + str(max(FOMC)) + " 年，請補上新年度")

    # 同一天同一件事只留一筆（法說會有中英文場次、上市上櫃重複時）
    seen, uniq = set(), []
    for e in ev:
        k = (e["date"], e["type"], e["title"])
        if k not in seen:
            seen.add(k)
            uniq.append(e)
    ev = uniq
    ev.sort(key=lambda e: (e["date"], e["type"], e.get("code", "")))
    out = DATA / "calendar.json"
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(today_str()) + ',"events":[\n')
        f.write(",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in ev))
        f.write("\n]}\n")
    by = {}
    for e in ev:
        by[e["type"]] = by.get(e["type"], 0) + 1
    log(f"calendar.json：{len(ev)} 筆（{'、'.join(f'{k} {v}' for k, v in by.items())}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
