// 「加入自選」小選單（LAYOUT-SPEC.md 第 7 節）：選要加到哪個自選股分頁，寫進同一份 config/groups.json（和我的追蹤同一份）。
// 不在追蹤清單的股票會一併加進追蹤清單（每天抓資料）。已在分頁裡的顯示「已加入」。
// 庫存股要股數和成本，請用「我的追蹤 → 匯入」，這裡不加。
// AddFav.open(按鈕, { m: "tw"|"us", code, name, market?, exchange? })
// 加入後發出 window 事件 "sd:groups"（detail：{ groups }），各區塊收到就重畫。
(function () {
  let pop = null;
  function close() { if (pop) { pop.remove(); pop = null; document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", onKey, true); } }
  function outside(e) { if (pop && !pop.contains(e.target)) close(); }
  function onKey(e) { if (e.key === "Escape") { close(); } }
  const keyOf = (s) => s.m + ":" + String(s.code).toUpperCase();

  async function add(stock, gi, btn) {
    btn.disabled = true;
    btn.querySelector(".af-state").textContent = "加入中…";
    try {
      const w = await Data.watchlist();
      if (!App.findStock(w, stock.code) || App.marketOf(App.findStock(w, stock.code)) !== stock.m) {
        const item = stock.m === "tw" ? { code: stock.code, name: stock.name, market: stock.market || "TWSE" } : { ticker: stock.code, name: stock.name, exchange: stock.exchange || "NASDAQ" };
        await App.editWatchlist("add", stock.m, item);
        Data.forget("watchlist");
      }
      const groups = await Data.groups();
      if (!groups[gi].items.includes(keyOf(stock))) groups[gi].items.push(keyOf(stock));
      await App.saveGroups(groups);
      btn.querySelector(".af-state").textContent = "已加入";
      btn.classList.add("on");
      window.dispatchEvent(new CustomEvent("sd:groups", { detail: { groups } }));
    } catch (e) {
      btn.disabled = false;
      btn.querySelector(".af-state").textContent = "⚠ " + e.message;
    }
  }

  async function open(anchor, stock) {
    close();
    pop = document.createElement("div");
    pop.className = "af-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "加入自選");
    pop.innerHTML = '<div class="af-head">加入自選：' + App.esc(stock.name || stock.code) + " <span class=\"updated\">" + App.esc(stock.code) + "</span></div><p class=\"note\">讀取中…</p>";
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(window.innerHeight - 20, r.bottom + 4) + window.scrollY + "px";
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 248, r.left)) + window.scrollX + "px";
    setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", onKey, true); });
    let groups;
    try { groups = await Data.groups(); } catch (e) { pop.querySelector(".note").textContent = "— 讀不到自選股分頁：" + e.message; return; }
    if (!pop) return;
    const k = keyOf(stock);
    pop.innerHTML = '<div class="af-head">加入自選：' + App.esc(stock.name || stock.code) + ' <span class="updated">' + App.esc(stock.code) + "</span></div>" +
      groups.map((g, i) => {
        const has = g.items.includes(k);
        return '<button type="button" class="af-item' + (has ? " on" : "") + '" data-g="' + i + '"' + (has ? " disabled" : "") + "><span>" + App.esc(g.name) + '</span><span class="af-state">' + (has ? "已加入" : "＋") + "</span></button>";
      }).join("") +
      '<p class="note af-foot">庫存股請到「我的追蹤 → 📥 匯入」。<a href="watchlist.html#g1">管理自選股 →</a></p>';
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-g]");
      if (b && !b.disabled) add(stock, +b.dataset.g, b);
    });
    const first = pop.querySelector("button:not([disabled])");
    if (first) first.focus();
  }

  // 某檔已在哪些分頁（給列表畫 ☆／★）
  async function inGroups(m, code) {
    try { const k = m + ":" + String(code).toUpperCase(); return (await Data.groups()).filter((g) => g.items.includes(k)).map((g) => g.name); } catch (e) { return []; }
  }

  window.AddFav = { open, close, inGroups };
})();
