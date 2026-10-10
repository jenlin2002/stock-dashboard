// 區塊：自選股（精簡版）。頁簽：庫存股（這台裝置匯入的持股）＋自選股分頁（config/groups.json，和我的追蹤同一份）。
// 每列：名稱、代號、股價、漲跌（庫存股多顯示報酬率）。點一列：發出 "sd:pick" 事件（detail：{ market, symbol }），
// 版面頁可以 preventDefault 自己處理（例如 C 版打開個股抽屜）；沒人處理就進個股頁。
// 參數：tab "hold"|"g1"…、max 每頁最多幾列（預設全部）、title（false＝不顯示）
(function () {
  Widgets.register("watchlist", (el, o) => {
    el.classList.add("w-watch");
    let tab = o.tab || "hold";
    try { tab = localStorage.getItem("w-watch-tab") || tab; } catch (e) {}
    const hold = Holdings.load();
    el.innerHTML = (o.title === false ? "" : '<div class="w-head"><h3>自選股</h3><a class="updated" data-c="manage" href="watchlist.html#hold">管理・匯入／匯出 →</a></div>') +
      '<div class="w-tabs" role="tablist" data-c="tabs"></div><div data-c="list"></div>';
    const q = (c) => el.querySelector('[data-c="' + c + '"]');

    async function draw() {
      let groups = [], tw = null, us = null;
      try { groups = await Data.groups(); } catch (e) {}
      if (tab !== "hold" && !groups[+tab.slice(1) - 1]) tab = "hold";
      const holdN = Object.keys(hold.tw).length + Object.keys(hold.us).length;
      q("tabs").innerHTML = '<button type="button" role="tab" data-t="hold" aria-pressed="' + (tab === "hold") + '">庫存股 <span class="g-cnt">' + holdN + "</span></button>" +
        groups.map((g, i) => '<button type="button" role="tab" data-t="g' + (i + 1) + '" aria-pressed="' + (tab === "g" + (i + 1)) + '">' + App.esc(g.name) + ' <span class="g-cnt">' + g.items.length + "</span></button>").join("");
      const manage = q("manage");
      if (manage) manage.href = "watchlist.html#" + tab;
      const keys = tab === "hold"
        ? Object.keys(hold.tw).sort().map((c) => "tw:" + c).concat(Object.keys(hold.us).sort().map((c) => "us:" + c))
        : groups[+tab.slice(1) - 1].items;
      if (!keys.length) {
        q("list").innerHTML = '<p class="note">— ' + (tab === "hold" ? "這台裝置還沒有匯入庫存（到「我的追蹤 → 📥 匯入」）" : "這個分頁還沒有股票（在選股器、個股按「＋自選」加入）") + "</p>";
        return;
      }
      try { tw = await Data.twAll(); } catch (e) {}
      if (keys.some((k) => k.startsWith("us:"))) { try { us = await Data.usAll(); } catch (e) {} }
      const rows = (o.max ? keys.slice(0, +o.max) : keys).map((k) => {
        const [m, code] = k.split(":");
        const s = (m === "tw" ? tw && tw.by.get(code) : us && us.by.get(code)) || {};
        const h = hold[m][code];
        const c = h ? Holdings.calc(h, s.close) : null;
        const name = s.name || (h && h.name) || code;
        return '<button type="button" class="w-row" data-m="' + m + '" data-s="' + App.esc(code) + '">' +
          '<span class="w-name"><b>' + App.esc(name) + '</b><span class="updated">' + (m === "us" ? "美・" : "") + App.esc(code) + "</span></span>" +
          '<span class="w-px">' + (App.isNum(s.close) ? (m === "us" ? "$" : "") + App.fmtPrice(s.close) : "—") + "</span>" +
          '<span class="w-chg ' + App.upDown(s.change_pct) + '">' + App.fmtPct(s.change_pct, true) + "</span>" +
          (tab === "hold" ? '<span class="w-pl ' + App.upDown(c && c.pl) + '" title="未實現報酬率（未扣手續費與稅）">' + (c && App.isNum(c.pct) ? App.fmtPct(c.pct, true) : "—") + "</span>" : "") +
          "</button>";
      }).join("");
      q("list").innerHTML = '<div class="w-rows">' + rows + "</div>" +
        (o.max && keys.length > +o.max ? '<a class="updated" href="watchlist.html#' + tab + '">還有 ' + (keys.length - o.max) + " 檔 →</a>" : "") +
        '<p class="updated w-asof">股價：' + (tw ? "台股 " + tw.updated : "") + (us ? "　美股 " + us.updated : "") + "（收盤後更新）</p>";
    }
    el.addEventListener("click", (e) => {
      const t = e.target.closest("button[data-t]");
      if (t) { tab = t.dataset.t; try { localStorage.setItem("w-watch-tab", tab); } catch (err) {} draw(); return; }
      const r = e.target.closest(".w-row");
      if (!r) return;
      const ev = new CustomEvent("sd:pick", { bubbles: true, cancelable: true, detail: { market: r.dataset.m, symbol: r.dataset.s } });
      if (r.dispatchEvent(ev)) location.href = "stock.html?symbol=" + encodeURIComponent(r.dataset.s) + "&m=" + r.dataset.m;
    });
    const onGroups = () => draw();
    window.addEventListener("sd:groups", onGroups);
    draw();
    return { destroy() { window.removeEventListener("sd:groups", onGroups); } };
  });
})();
