// 共用：讀 JSON、找股票、格式化數字
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

  function findStock(watchlist, symbol) {
    const s = String(symbol || "").toUpperCase();
    return watchlist.tw.find((x) => x.code === s) || watchlist.us.find((x) => x.ticker.toUpperCase() === s) || null;
  }

  // 台股營收以「億元」、美股以 B / M 顯示（Phase 5 用）
  function fmtRevenue(n, market) {
    if (n == null || isNaN(n)) return "—";
    if (market === "TW") return (n / 1e8).toLocaleString("zh-TW", { maximumFractionDigits: 1 }) + " 億";
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " B";
    return (n / 1e6).toFixed(1) + " M";
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return "—";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }

  window.App = { loadJSON, loadWatchlist, symbolOf, findStock, fmtRevenue, fmtPct };
})();
