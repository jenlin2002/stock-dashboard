// 共用資料（LAYOUT-SPEC.md 的 data.js）：同一頁好幾個區塊要同一份 JSON 時只抓一次。
// 失敗不快取（下次再試）。表格型 JSON（{fields, rows}）可以轉成物件陣列。
(function () {
  const memo = {};
  function once(key, fn) {
    if (!memo[key]) memo[key] = Promise.resolve().then(fn).catch((e) => { delete memo[key]; throw e; });
    return memo[key];
  }
  const toObjects = (d) => d.rows.map((r) => Object.fromEntries(d.fields.map((f, i) => [f, r[i]])));

  window.Data = {
    json: (path) => once("json:" + path, () => App.loadJSON(path)),
    // {fields, rows} → { updated, rows: [物件], by: Map(code → 物件) }
    table: (path) => once("table:" + path, async () => {
      const d = await App.loadJSON(path);
      const rows = toObjects(d);
      return { updated: d.updated, rows, by: new Map(rows.map((r) => [String(r.code).toUpperCase(), r])) };
    }),
    // 全台股總表＋選股器資料（data/screener-tw.json：均線、5／20 日漲跌、法人、融資、單季 EPS；第 7 步）合併成同一列
    twAll: () => once("twAll", async () => {
      const t = await Data.table("data/all/stocks.json");
      try {
        const sc = await App.loadJSON("data/screener-tw.json");
        const idx = new Map(sc.fields.map((f, i) => [f, i]));
        const by = new Map(sc.rows.map((r) => [r[0], r]));
        t.rows.forEach((s) => {
          const r = by.get(s.code);
          if (r) for (const [f, i] of idx) if (f !== "code") s[f] = r[i];
        });
        t.screener = { updated: sc.updated, price_date: sc.price_date, inst_date: sc.inst_date, margin_date: sc.margin_date, eps_quarter: sc.eps_quarter };
      } catch (e) { t.screener = null; }  // 還沒有選股器資料：相關條件顯示待補
      return t;
    }),
    // 全美股（Nasdaq 選股器的價格、市值、產業）＋美股選股欄位（data/screener-us.json：SEC 財報算的 EPS、PEG、營收成長、自由現金流率、Rule of 40）
    usAll: () => once("usAll", async () => {
      const t = await Data.table("data/all/us_stocks.json");
      try {
        const sc = await App.loadJSON("data/screener-us.json");
        const idx = new Map(sc.fields.map((f, i) => [f, i]));
        const by = new Map(sc.rows.map((r) => [r[0], r]));
        t.rows.forEach((s) => {
          const r = by.get(s.code);
          if (!r) return;
          for (const [f, i] of idx) if (f !== "code") s[f] = r[i];
          s.rev_yoy = s.rev_growth;  // 四面評分的基本面用同一個欄位名
        });
        t.fundamentals = { updated: sc.updated, quarter: sc.quarter };
      } catch (e) { t.fundamentals = null; }
      return t;
    }),
    market: () => Data.json("data/market.json"),
    watchlist: () => once("watchlist", () => App.loadWatchlist()),
    groups: () => once("groups", async () => App.loadGroups(await Data.watchlist())),
    // 個股資料：追蹤清單的讀排程檔，其他即時查詢
    stock: (item) => once("stock:" + App.marketOf(item) + ":" + App.symbolOf(item).toUpperCase(),
      () => App.loadStockData(item).catch(() => App.loadLiveData(item))),
    // 代號 → watchlist 格式的 item（找不到就用清單猜：純數字是台股）
    item: async (market, symbol) => {
      const s = String(symbol || "").trim().toUpperCase();
      if (!s) return null;
      try { const w = await Data.watchlist(); const hit = App.findStock(w, s); if (hit && (!market || App.marketOf(hit) === market)) return hit; } catch (e) {}
      const hit = await App.lookupStock(s, market === "tw" || market === "us" ? market : undefined);
      if (hit) return hit;
      return /^\d{4,6}[A-Z]?$/.test(s) ? { code: s, name: s, market: "TWSE" } : { ticker: s, name: s, exchange: "NASDAQ" };
    },
    // 改過自選股、追蹤清單後讓下次重抓
    forget: (...keys) => keys.forEach((k) => delete memo[k]),
  };
})();
