// 共用：讀 JSON、找股票、格式化數字、漲跌顏色（紅漲綠跌）
(function () {
  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  // 追蹤清單：讀網站上的 config/watchlist.json。
  // 剛用「＋」或「×」改過時，GitHub 上的檔案已更新、但網站還沒重新部署（約 1～3 分鐘），
  // 這段期間用改完後 API 回傳的清單（存在瀏覽器 15 分鐘）。
  const OVERRIDE_KEY = "watchlist-override", OVERRIDE_MS = 15 * 60 * 1000;
  async function loadWatchlist() {
    try {
      const o = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "null");
      if (o && Date.now() - o.ts < OVERRIDE_MS) return { tw: o.data.tw || [], us: o.data.us || [] };
      localStorage.removeItem(OVERRIDE_KEY);
    } catch (e) {}
    const w = await loadJSON("config/watchlist.json");
    return { tw: w.tw || [], us: w.us || [] };
  }

  // 新增／移除追蹤股票：呼叫 functions/api/watchlist.js（它會改 GitHub 上的 watchlist.json）
  async function editWatchlist(action, market, item) {
    const res = await fetch("api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, market, item }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "修改失敗（" + res.status + "）");
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ ts: Date.now(), data: body.watchlist })); } catch (e) {}
    return body.watchlist;
  }

  function symbolOf(item) { return item.code || item.ticker; }
  function marketOf(item) { return item.code ? "tw" : "us"; }

  function findStock(watchlist, symbol) {
    const s = String(symbol || "").toUpperCase();
    return watchlist.tw.find((x) => x.code === s) || watchlist.us.find((x) => x.ticker.toUpperCase() === s) || null;
  }

  // 個股資料檔：data/tw/2330.json、data/us/AAPL.json（排程產生，只有追蹤清單裡的股票）
  function loadStockData(item) {
    return loadJSON("data/" + marketOf(item) + "/" + symbolOf(item).toUpperCase() + ".json");
  }

  // 不在追蹤清單的股票：呼叫 Cloudflare Function 即時抓（functions/api/stock.js）
  async function loadLiveData(item) {
    const q = new URLSearchParams({ market: marketOf(item), symbol: symbolOf(item), name: item.name || "" });
    if (item.code) q.set("exchange", item.market || "TWSE");
    else { q.set("exchange", item.exchange || "NASDAQ"); if (item.cik) q.set("cik", item.cik); }
    const res = await fetch("api/stock?" + q);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "即時查詢失敗（" + res.status + "）");
    return body;
  }

  // 全部台股、美股的代號清單（搜尋框用，約 500KB，只載入一次）
  let stockListPromise = null;
  function loadStockList() {
    if (!stockListPromise) stockListPromise = loadJSON("data/stocklist.json").catch((e) => { stockListPromise = null; throw e; });
    return stockListPromise;
  }

  // 搜尋全部股票（代號或名稱）：代號完全相符 > 代號開頭 > 名稱開頭 > 名稱包含
  // 回傳 [{ symbol, name, tag, m, item }]，item 是 watchlist 格式
  async function searchStocks(query, limit) {
    const q = String(query || "").trim().toUpperCase();
    if (!q) return [];
    const list = await loadStockList();
    const score = (code, name) => {
      const c = code.toUpperCase(), n = name.toUpperCase();
      return c === q ? 0 : c.startsWith(q) ? 1 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : -1;
    };
    const out = [];
    for (const [code, name, market, industry] of list.tw) {
      const sc = score(code, name);
      if (sc >= 0) out.push({ sc, symbol: code, name, m: "tw", tag: (market === "TWSE" ? "上市" : "上櫃") + (industry ? "・" + industry : ""), item: { code, name, market } });
    }
    for (const [ticker, name, exch] of list.us) {
      const sc = score(ticker, name);
      if (sc >= 0) out.push({ sc, symbol: ticker, name, m: "us", tag: exch, item: { ticker, name, exchange: exch } });
    }
    out.sort((a, b) => a.sc - b.sc || a.symbol.length - b.symbol.length || (a.symbol < b.symbol ? -1 : 1));
    return out.slice(0, limit || 10);
  }

  // 在清單裡找代號，回傳與 watchlist 相同格式的 item；m 可指定 "tw" / "us"
  async function lookupStock(symbol, m) {
    const s = String(symbol || "").toUpperCase();
    let list;
    try { list = await loadStockList(); } catch (e) { return null; }
    if (m !== "us") {
      const t = list.tw.find((x) => x[0] === s);
      if (t) return { code: t[0], name: t[1], market: t[2], industry: t[3] };
    }
    if (m !== "tw") {
      const u = list.us.find((x) => x[0] === s);
      if (u) return { ticker: u[0], name: u[1], exchange: u[2], cik: u[3] };
    }
    return null;
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

  // ---------- 深色／淺色 ----------
  // 手動選擇存在 localStorage "theme"（"dark" / "light"），沒選就跟系統。各頁 <head> 有一小段先套用，避免閃一下。
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : darkMQ.matches;
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) {}
    document.dispatchEvent(new Event("themechange"));
  }

  // 深淺色改變時呼叫 fn（手動切換或系統改變都算）
  function onThemeChange(fn) {
    document.addEventListener("themechange", fn);
    darkMQ.addEventListener("change", () => { if (!document.documentElement.dataset.theme) fn(); });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.App = {
    loadJSON, loadWatchlist, editWatchlist, symbolOf, marketOf, findStock, loadStockData, loadLiveData, loadStockList, lookupStock, searchStocks,
    isNum, fmtNum, fmtPrice, fmtRevenue, revenueUnit, fmtPct, upDown, cssVar, onThemeChange, isDark, setTheme, esc,
  };
})();
