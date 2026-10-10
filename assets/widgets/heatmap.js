// 區塊：熱力圖（台股／美股；個股或類股）。沿用 assets/heatmap.js 的 treemap 和大盤頁的規則。
// 參數：market "tw"|"us"、view "stock"|"sector"、size "mktcap"（方塊＝市值）|"turnover"（方塊＝成交金額，台股）、
//       n 前幾大、height 高度（px）、title 標題（false＝不顯示）
(function () {
  const SIZES = { tw: [["100", "前 100 大"], ["300", "前 300 大"], ["all", "全部"]], us: [["100", "前 100 大"], ["300", "前 300 大"], ["500", "前 500 大"]] };
  const sectorOf = (mk, s) => (mk === "tw" ? s.industry || "其他" : s.sector || "其他");
  const money = (mk, v) => (mk === "tw" ? App.fmtNum(v / 1e8, 0) + " 億" : "$" + App.fmtNum(v / 1e9, 1) + "B");

  Widgets.register("heatmap", (el, o) => {
    const st = {
      mk: o.market === "us" ? "us" : "tw", view: o.view === "sector" ? "sector" : "stock", n: String(o.n || "300"),
      size: o.size === "turnover" ? "turnover" : "mktcap", tmk: "all", sector: null,
    };
    const range = () => (st.mk === "tw" ? 5 : 3) * (st.view === "sector" ? 0.6 : 1);
    el.classList.add("w-heat");
    el.innerHTML =
      (o.title === false ? "" : '<div class="w-head"><h3></h3><span class="updated w-asof"></span></div>') +
      '<div class="tf-tabs w-ctl"><span class="seg" data-c="view"></span> <span class="seg" data-c="n"></span> <span class="seg" data-c="tmk"></span> <span data-c="chip"></span></div>' +
      '<div class="heat" style="height:' + (+o.height || 480) + 'px"></div><div class="heat-legend"></div>';
    const host = el.querySelector(".heat"), q = (c) => el.querySelector('[data-c="' + c + '"]');
    let rows = null, rowsMk = null;

    async function draw() {
      const mk = st.mk;
      const h3 = el.querySelector(".w-head h3");
      if (h3) h3.textContent = (mk === "tw" ? "台股" : "美股") + (st.view === "sector" ? "類股" : "") + "熱力圖" + (st.size === "turnover" ? "（方塊＝成交金額）" : "");
      q("view").innerHTML = [["stock", "個股"], ["sector", "類股"]].map(([k, t]) => '<button type="button" data-view="' + k + '" aria-pressed="' + (st.view === k) + '">' + t + "</button>").join("");
      q("n").innerHTML = st.view === "sector" ? "" : SIZES[mk].map(([k, t]) => '<button type="button" data-n="' + k + '" aria-pressed="' + (st.n === k) + '">' + t + "</button>").join("");
      q("n").hidden = st.view === "sector";
      q("tmk").innerHTML = mk === "tw" ? [["all", "上市＋上櫃"], ["TWSE", "上市"], ["TPEX", "上櫃"]].map(([k, t]) => '<button type="button" data-tmk="' + k + '" aria-pressed="' + (st.tmk === k) + '">' + t + "</button>").join("") : "";
      q("tmk").hidden = mk !== "tw";
      q("chip").innerHTML = st.sector && st.view === "stock" ? '<button type="button" class="btn heat-chip" data-act="all">只看：' + App.esc(st.sector) + "　✕ 看全部</button>" : "";
      el.querySelector(".heat-legend").innerHTML = Heatmap.legend(range());
      if (rowsMk !== mk) {
        host.innerHTML = '<p class="note" style="color:#ccc">讀取中…</p>';
        try {
          const t = await (mk === "tw" ? Data.twAll() : Data.usAll());
          if (st.mk !== mk) return;
          rows = t.rows; rowsMk = mk;
          const asof = el.querySelector(".w-asof");
          if (asof) asof.textContent = "資料 " + t.updated;
        } catch (e) { host.innerHTML = '<p class="note" style="color:#ccc">— 讀不到資料（' + App.esc(e.message) + "）</p>"; return; }
      }
      // 方塊大小：市值，或成交金額（台股量是張：張 × 1000 × 股價）
      const val = (s) => (st.size === "turnover" ? (App.isNum(s.volume) && App.isNum(s.close) ? s.volume * (mk === "tw" ? 1000 : 1) * s.close : 0) : s.mktcap);
      let list = rows.filter((s) => App.isNum(val(s)) && val(s) > 0 && (mk === "us" || st.tmk === "all" || s.market === st.tmk));
      list.sort((a, b) => val(b) - val(a));
      if (st.view === "sector") {
        const by = {};
        list.forEach((s) => (by[sectorOf(mk, s)] = by[sectorOf(mk, s)] || []).push(s));
        const items = Object.entries(by).map(([name, g]) => {
          const tot = g.reduce((a, s) => a + val(s), 0);
          const w = g.filter((s) => App.isNum(s.change_pct));
          const wv = w.reduce((a, s) => a + val(s), 0);
          const pct = wv ? w.reduce((a, s) => a + s.change_pct * val(s), 0) / wv : null;
          const up = g.filter((s) => s.change_pct > 0).length, down = g.filter((s) => s.change_pct < 0).length;
          return { key: name, label: name, value: tot, pct,
            title: name + "\n" + g.length + " 檔・" + (st.size === "turnover" ? "成交金額 " : "總市值 ") + money(mk, tot) + "\n加權漲跌 " + App.fmtPct(pct, true) + "\n上漲 " + up + "・下跌 " + down + "\n點一下看這個類股的個股" };
        });
        Heatmap.render(host, [{ name: "", items }], { range: range() });
        return;
      }
      if (st.sector) list = list.filter((s) => sectorOf(mk, s) === st.sector);
      if (st.n !== "all") list = list.slice(0, +st.n);
      const groups = {};
      list.forEach((s) => {
        const g = st.sector && mk === "us" ? s.industry || st.sector : sectorOf(mk, s);
        (groups[g] = groups[g] || []).push({
          label: mk === "tw" ? s.name : s.code, value: val(s), pct: s.change_pct,
          href: "stock.html?symbol=" + encodeURIComponent(s.code) + "&m=" + mk,
          title: s.code + " " + s.name + "\n" + g + "\n漲跌 " + App.fmtPct(s.change_pct, true) + "　" + (st.size === "turnover" ? "成交金額 " + money(mk, val(s)) : "市值 " + money(mk, s.mktcap)),
        });
      });
      Heatmap.render(host, Object.entries(groups).map(([name, items]) => ({ name, items })), { range: range() });
    }

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b && el.querySelector(".w-ctl").contains(b)) {
        if (b.dataset.view) { st.view = b.dataset.view; st.sector = null; }
        else if (b.dataset.n) st.n = b.dataset.n;
        else if (b.dataset.tmk) st.tmk = b.dataset.tmk;
        else if (b.dataset.act === "all") st.sector = null;
        draw();
        return;
      }
      const a = e.target.closest(".hm-tile[data-key]");
      if (a) { e.preventDefault(); st.sector = a.dataset.key; st.view = "stock"; draw(); }
    });
    let rz, lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      if (!w || w === lastW) return;
      lastW = w;
      clearTimeout(rz);
      rz = setTimeout(() => { if (rows) draw(); }, 150);
    });
    ro.observe(host);
    draw();
    return {
      update(n) { if (n.market && n.market !== st.mk && (n.market === "tw" || n.market === "us")) { st.mk = n.market; st.sector = null; draw(); } },
      redraw: draw,
      destroy() { ro.disconnect(); },
    };
  });
})();
