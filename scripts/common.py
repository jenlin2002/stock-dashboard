"""fetch_tw.py / fetch_us.py / build_summary.py 共用的小工具。"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def log(*args):
    print(*args, flush=True)


def warn(*args):
    print("[警告]", *args, file=sys.stderr, flush=True)


def load_watchlist():
    with open(ROOT / "config" / "watchlist.json", encoding="utf-8") as f:
        return json.load(f)


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        # 每個欄位一行，長陣列不展開：檔案小、git diff 也看得懂
        f.write("{\n")
        items = list(obj.items())
        for i, (k, v) in enumerate(items):
            sep = "," if i < len(items) - 1 else ""
            f.write(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False, separators=(',', ':'))}{sep}\n")
        f.write("}\n")
    tmp.replace(path)


def today_str():
    return date.today().isoformat()


def pct(new, old):
    """成長率（%），任一邊缺值或分母為 0 時回傳 None。"""
    if new is None or old in (None, 0):
        return None
    return round((new - old) / abs(old) * 100, 2)
