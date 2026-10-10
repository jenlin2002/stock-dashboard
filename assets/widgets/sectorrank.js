// 區塊：類股輪動排行（橫條）。今日＝各產業市值加權漲跌（全台股總表）；美股 GICS＝Nasdaq 選股器的 sector。
// 5 日、20 日累計要每檔的歷史股價，資料待補（LAYOUT-SPEC 第 7 步），按鈕先灰掉。
// 參數：period "1"|"5"|"20"|"us"、top 顯示前幾名（預設全部）
(function () {
  const isNum = (x) => App.isNum(x);
  // 5 日、20 日：data/screener-tw.json 的 chg5、chg20（第 7 步）；沒有那份檔案時灰掉
  const PERIODS = [["1", "今日", false, "change_pct"], ["5", "5 日", true, "chg5"], ["20", "20 日", true, "chg20"], ["us", "美股 GICS", false, "change_pct"]];
  Widgets.register("sectorRank", (el, o) => {
    el.classList.add("w-srank");
    let period = o.period || "1";
    el.innerHTML = (o.title === false ? "" : '<div class="w-head"><h3>類股輪動排行</h3><span class="updated" data-c="asof"></span></div>') +
      '<div class="tf-tabs" style="padding:0 14px 8px"><span class="seg" data-c="seg"></span></div><div class="sr-list" data-c="list"></div>';
    const q = (c) => el.querySelector('[data-c="' + c + '"]');
    async function draw() {
      let has = false;
      try { has = !!(await Data.twAll()).screener; } catch (e) {}
      q("seg").innerHTML = PERIODS.map(([k, t, need]) => '<button type="button" data-p="' + k + '" aria-pressed="' + (period === k) + '"' + (need && !has ? ' disabled title="需要選股器資料（data/screener-tw.json），排程跑過後才有"' : "") + ">" + t + "</button>").join("");
      if (!has && (period === "5" || period === "20")) period = "1";
      const vk = PERIODS.find((p) => p[0] === period)[3];
      let t;
      try { t = await (period === "us" ? Data.usAll() : Data.twAll()); } catch (e) { q("list").innerHTML = '<p class="note">— 讀不到資料</p>'; return; }
      const key = period === "us" ? "sector" : "industry";
      const by = {};
      t.rows.forEach((s) => { if (isNum(s.mktcap) && s.mktcap > 0 && isNum(s[vk])) (by[s[key] || "其他"] = by[s[key] || "其他"] || []).push(s); });
      let rows = Object.entries(by).map(([name, g]) => {
        const cap = g.reduce((a, s) => a + s.mktcap, 0);
        return { name, n: g.length, pct: g.reduce((a, s) => a + s[vk] * s.mktcap, 0) / cap, up: g.filter((s) => s[vk] > 0).length };
      }).filter((r) => r.n >= 3).sort((a, b) => b.pct - a.pct);
      if (o.top) rows = rows.slice(0, +o.top).concat(rows.length > 2 * o.top ? rows.slice(-o.top) : []);
      const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.pct)));
      const asof = q("asof");
      if (asof) asof.textContent = "市值加權" + (period === "5" ? " 5 日" : period === "20" ? " 20 日" : "") + "漲跌・資料 " + (period === "5" || period === "20" ? t.screener.price_date : t.updated);
      q("list").innerHTML = rows.map((r) => '<div class="cb-row sr-row" title="' + App.esc(r.name) + "：" + r.n + " 檔，上漲 " + r.up + ' 檔"><span class="cb-name">' + App.esc(r.name) + '</span><span class="cb-track"><i class="' + (r.pct >= 0 ? "up-bg" : "down-bg") + '" style="width:' + (Math.abs(r.pct) / max * 50).toFixed(1) + "%;" + (r.pct >= 0 ? "left:50%" : "right:50%") + '"></i></span><b class="' + App.upDown(r.pct) + '">' + App.fmtPct(r.pct, true) + "</b></div>").join("");
    }
    el.addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (b && !b.disabled && b.dataset.p !== period) { period = b.dataset.p; draw(); } });
    draw();
  });
})();
