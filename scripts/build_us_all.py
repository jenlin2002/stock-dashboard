"""全部美股（Nasdaq、NYSE、AMEX）的價格、漲跌、市值、產業，輸出 data/all/us_stocks.json。
來源：Nasdaq 官網選股器的資料（api.nasdaq.com/api/screener/stocks），一次拿全部，免 key；收盤後更新。
給大盤頁的美股熱力圖用（之後的美股總表也用它）。抓不到就保留舊檔。
"""
import json
import sys

import requests

from common import DATA, log, today_str, warn

PATH = DATA / "all" / "us_stocks.json"
FIELDS = ["code", "name", "sector", "industry", "country", "close", "change", "change_pct", "volume", "mktcap"]
# 產業（sector）中文
SECTOR = {
    "Technology": "科技", "Finance": "金融", "Health Care": "醫療保健", "Consumer Discretionary": "非必需消費",
    "Consumer Staples": "必需消費", "Industrials": "工業", "Energy": "能源", "Utilities": "公用事業",
    "Real Estate": "不動產", "Basic Materials": "原物料", "Telecommunications": "通訊", "Miscellaneous": "其他", "": "其他",
}


def num(x):
    s = str(x or "").replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def clean_name(n):
    """'Apple Inc. Common Stock' → 'Apple Inc.'"""
    for tail in (" Common Stock", " Class A Common Stock", " Class B Common Stock", " Ordinary Shares", " American Depositary Shares"):
        if tail in n:
            n = n.split(tail)[0]
    return n.strip()


def main():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/",
    }
    try:
        r = requests.get("https://api.nasdaq.com/api/screener/stocks", params={"tableonly": "true", "limit": "10000", "download": "true"},
                         headers=headers, timeout=90)
        r.raise_for_status()
        rows = r.json()["data"]["rows"]
    except Exception as e:
        warn(f"Nasdaq 選股器抓不到，保留舊檔：{e}")
        return 0
    out = []
    for x in rows:
        cap, close = num(x.get("marketCap")), num(x.get("lastsale"))
        if not cap or not close or "^" in x["symbol"] or "/" in x["symbol"]:  # 排除特別股、權證等
            continue
        out.append([x["symbol"].strip(), clean_name(x.get("name", "")), SECTOR.get(x.get("sector") or "", x.get("sector")), x.get("industry") or "",
                    x.get("country") or "", close, num(x.get("netchange")), num(x.get("pctchange")), int(num(x.get("volume")) or 0), int(cap)])
    out.sort(key=lambda r: -r[-1])  # 市值大到小
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"updated":' + json.dumps(today_str()) + ',"fields":' + json.dumps(FIELDS) + ',"rows":[\n')
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in out))
        f.write("\n]}\n")
    log(f"us_stocks.json：{len(out)} 檔，{PATH.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
