// 共用：讀 JSON、找股票、格式化數字、漲跌顏色（紅漲綠跌）
(function () {
  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  async function loadWatchlist() {
    const w = await loadJSON("config/watchlist.json");
    return { tw: w.tw || [], us: w.us || [] };
  }

  function symbolOf(item) { return item.code || item.ticker; }
  function marketOf(item) { return item.code ? "tw" : "us"; }

  function findStock(watchlist, symbol) {
    const s = String(symbol || "").toUpperCase();
    return watchlist.tw.find((x) => x.code === s) || watchlist.us.find((x) => x.ticker.toUpperCase() === s) || null;
  }

  // 個股資料檔：data/tw/2330.json、data/us/AAPL.json（Phase 2、3 產生）
  function loadStockData(item) {
    return loadJSON("data/" + marketOf(item) + "/" + symbolOf(item).toUpperCase() + ".json");
  }

  function isNum(n) { return typeof n === "number" && isFinite(n); }

  function fmtNum(n, digits) {
    if (!isNum(n)) return "—";
    return n.toLocaleString("zh-TW", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }

  // 價格：1000 以上不顯示小數，其餘 2 位
  function fmtPrice(n) {
    if (!isNum(n)) return "—";
    return fmtNum(n, Math.abs(n) >= 1000 ? 0 : 2);
  }

  // 台股營收以「億元」、美股以 B / M 顯示
  function fmtRevenue(n, market) {
    if (!isNum(n)) return "—";
    if (market === "TW") return fmtNum(n / 1e8, n >= 1e11 ? 0 : 1) + " 億";
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    return "$" + (n / 1e6).toFixed(1) + "M";
  }

  // 圖表座標用的營收換算
  function revenueUnit(market) {
    return market === "TW" ? { div: 1e8, label: "億元" } : { div: 1e9, label: "十億美元" };
  }

  function fmtPct(n, signed) {
    if (!isNum(n)) return "—";
    return (signed && n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }

  // 紅漲綠跌：正數 up（紅）、負數 down（綠）
  function upDown(n) {
    if (!isNum(n) || n === 0) return "";
    return n > 0 ? "up" : "down";
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // 系統深淺色切換時呼叫 fn
  function onThemeChange(fn) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.App = {
    loadJSON, loadWatchlist, symbolOf, marketOf, findStock, loadStockData,
    isNum, fmtNum, fmtPrice, fmtRevenue, revenueUnit, fmtPct, upDown, cssVar, onThemeChange, esc,
  };
})();
