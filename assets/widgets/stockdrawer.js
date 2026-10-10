// 區塊：個股抽屜（C 版右欄）：股價、迷你走勢、四面評分環、PEG 評分卡（m／s 圓點）、技術與籌碼重點（均線排列、扣抵門檻、RSI、ADX）、★ 加入自選。
// 參數：market、symbol；回傳 update({market, symbol})
(function () {
  const isNum = (x) => App.isNum(x);
  function spark(vals) {
    const v = vals.filter(isNum);
    if (v.length < 2) return "";
    const min = Math.min(...v), max = Math.max(...v), W = 300, H = 70;
    const pts = v.map((x, i) => (i / (v.length - 1) * W).toFixed(1) + "," + (H - (x - min) / (max - min || 1) * H).toFixed(1)).join(" ");
    return '<svg class="dr-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--' + (App.upDown(v[v.length - 1] - v[0]) || "muted") + ')" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  Widgets.register("stockDrawer", (el, o) => {
    el.classList.add("w-drawer");
    let cur = { market: o.market, symbol: String(o.symbol || "").toUpperCase() }, seq = 0;
    async function draw() {
      const my = ++seq;
      if (!cur.symbol) { el.innerHTML = '<p class="note">— 點中間的結果列，這裡就會顯示那一檔。</p>'; return; }
      el.innerHTML = '<p class="note">讀取中…</p>';
      let item, d, s = null, f = null;
      try { item = await Data.item(cur.market === "both" ? null : cur.market, cur.symbol); d = await Data.stock(item); } catch (e) { if (my === seq) el.innerHTML = '<p class="note">— 讀不到 ' + App.esc(cur.symbol) + "（" + App.esc(e.message) + "）</p>"; return; }
      const m = App.marketOf(item), code = App.symbolOf(item).toUpperCase();
      try { const t = await (m === "tw" ? Data.twAll() : Data.usAll()); s = t.by.get(code) || null; f = Scoring.faces(t.rows).get(code) || null; } catch (e) {}
      if (my !== seq) return;
      const p = d.price, n = p.close.length, c = p.close[n - 1], ch = n > 1 ? (c / p.close[n - 2] - 1) * 100 : null;
      const name = (s && s.name) || d.name || item.name;
      let tech;
      try { tech = StockFaces.technical(p); } catch (e) { tech = '<p class="note">— 日線資料不夠</p>'; }
      el.innerHTML =
        '<div class="dr-head"><div><b class="sf-name">' + App.esc(name) + '</b> <span class="updated">' + (m === "us" ? "美股・" : "") + App.esc(code) + (s && s.industry ? "・" + App.esc(s.industry) : "") + "</span></div>" +
        '<div><b class="sf-px ' + App.upDown(ch) + '">' + (m === "us" ? "$" : "") + App.fmtPrice(c) + '</b> <span class="' + App.upDown(ch) + '">' + App.fmtPct(ch, true) + '</span> <span class="updated">' + p.dates[n - 1] + "</span></div></div>" +
        spark(p.close.slice(-120)) + '<p class="updated dr-cap">近 120 個交易日</p>' +
        '<div class="dr-rings">' + Scoring.LABELS.map(([k, t]) => Scoring.ring({ fund: "基本面", value: "評價", tech: "技術面", chip: "籌碼面" }[k], f ? f[k] : null)).join("") + "</div>" +
        '<p class="updated dr-cap">四面評分 0–100（全市場百分位，公式見頁尾）' + (m === "us" ? "；美股沒有技術面、籌碼面資料" : "") + "</p>" +
        '<div class="dr-act"><button type="button" class="btn primary" data-act="fav">★ 加入自選</button> <a class="btn" href="stock.html?symbol=' + encodeURIComponent(code) + "&m=" + m + '">完整個股頁 →</a></div>' +
        '<h4 class="dr-h">本益成長比評分卡</h4><div data-c="peg"></div>' +
        '<h4 class="dr-h">技術重點</h4><div class="sf-card">' + tech + "</div>" +
        '<h4 class="dr-h">籌碼重點</h4>' + (m === "tw" ? '<div class="sf-card">' + StockFaces.chips(s) + "</div>" : '<p class="note">— 美股沒有法人、融資資料</p>');
      Widgets.render(el.querySelector('[data-c="peg"]'), "pegCard", { market: m, symbol: code, help: false });
      el.querySelector('[data-act="fav"]').addEventListener("click", (e) => AddFav.open(e.target, { m, code, name, market: item.market, exchange: item.exchange }));
    }
    draw();
    return { update(n) { const sym = String(n.symbol || "").toUpperCase(); if (sym && (sym !== cur.symbol || (n.market && n.market !== cur.market))) { cur = { market: n.market, symbol: sym }; draw(); } } };
  });
})();
