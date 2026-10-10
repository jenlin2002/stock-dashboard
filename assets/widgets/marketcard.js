// 區塊：大盤卡（B 版總覽）。台股：加權（market.json）＋成交金額、漲跌家數、法人；美股：S&P 500 走勢（api/intraday 日線）＋Nasdaq、費半、VIX（延遲報價）。
// 參數：market "tw"|"us"
(function () {
  const isNum = (x) => App.isNum(x);
  const signed = (x, d) => (isNum(x) ? (x > 0 ? "+" : x < 0 ? "−" : "") + App.fmtNum(Math.abs(x), d == null ? 2 : d) : "—");
  function spark(vals) {
    const v = vals.filter(isNum);
    if (v.length < 2) return "";
    const min = Math.min(...v), max = Math.max(...v), W = 300, H = 60;
    const pts = v.map((x, i) => (i / (v.length - 1) * W).toFixed(1) + "," + (H - (x - min) / (max - min || 1) * H).toFixed(1)).join(" ");
    return '<svg class="mc-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--' + (App.upDown(v[v.length - 1] - v[0]) || "muted") + ')" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  const stat = (name, val) => "<div><span>" + name + "</span><b>" + val + "</b></div>";

  Widgets.register("marketCard", (el, o) => {
    el.classList.add("w-mcard");
    const mk = o.market === "us" ? "us" : "tw";
    el.innerHTML = '<p class="note">讀取中…</p>';
    (async () => {
      try {
        if (mk === "tw") {
          const m = await Data.market(), s = m.taiex, n = s.close.length;
          const c = s.close[n - 1], p = s.close[n - 2];
          const inst = (m.inst || [])[(m.inst || []).length - 1];
          let updown = "—";
          try { const a = await Data.twAll(); const ch = a.rows.map((r) => r.change_pct).filter(isNum); updown = '<span class="up">' + ch.filter((x) => x > 0).length + '</span>／<span class="down">' + ch.filter((x) => x < 0).length + "</span>"; } catch (e) {}
          el.innerHTML = '<div class="w-head"><h3>台股大盤</h3><span class="updated">' + s.dates[n - 1] + '</span><a href="market.html#tw">大盤頁 →</a></div>' +
            '<div class="mc-main"><span class="mc-name">加權指數</span><b class="mc-val ' + App.upDown(c - p) + '">' + App.fmtNum(c, 2) + '</b><span class="' + App.upDown(c - p) + '">' + signed(c - p) + "（" + App.fmtPct((c / p - 1) * 100, true) + "）</span></div>" +
            spark(s.close.slice(-120)) +
            '<div class="mc-stats">' + stat("成交金額", App.fmtNum(s.volume[n - 1] / 1e8, 0) + " 億") + stat("漲／跌家數", updown) +
            stat("三大法人", inst ? '<span class="' + App.upDown(inst.foreign + inst.trust + inst.dealer) + '">' + signed((inst.foreign + inst.trust + inst.dealer) / 1e8, 1) + " 億</span>" : "—") + "</div>";
        } else {
          const [d, q] = await Promise.all([Data.json("api/intraday?market=idx&symbol=GSPC&tf=D"), Data.json("api/quotes?set=us")]);
          const p = d.price, n = p.close.length, by = Object.fromEntries(q.quotes.map((x) => [x.key, x]));
          const g = by.GSPC || {};
          const one = (k, dg) => { const x = by[k]; return x && isNum(x.price) ? App.fmtNum(x.price, dg) + ' <span class="' + App.upDown(x.change) + '">' + App.fmtPct(x.change_pct, true) + "</span>" : "—"; };
          el.innerHTML = '<div class="w-head"><h3>美股大盤</h3><span class="updated">' + (g.time || p.dates[n - 1]) + '（延遲）</span><a href="market.html#us">大盤頁 →</a></div>' +
            '<div class="mc-main"><span class="mc-name">S&P 500</span><b class="mc-val ' + App.upDown(g.change) + '">' + App.fmtNum(isNum(g.price) ? g.price : p.close[n - 1], 2) + '</b><span class="' + App.upDown(g.change) + '">' + signed(g.change) + "（" + App.fmtPct(g.change_pct, true) + "）</span></div>" +
            spark(p.close.slice(-120)) +
            '<div class="mc-stats">' + stat("Nasdaq", one("IXIC", 2)) + stat("費半", one("SOX", 2)) + stat("VIX", one("VIX", 2)) + "</div>";
        }
      } catch (e) { el.innerHTML = '<div class="w-head"><h3>' + (mk === "tw" ? "台股" : "美股") + '大盤</h3></div><p class="note">— 讀不到資料（' + App.esc(e.message) + "）</p>"; }
    })();
  });
})();
