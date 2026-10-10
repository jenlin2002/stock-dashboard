// 區塊：個股四面分析（基本面、評價、技術面、籌碼面）＋加入自選。
// 基本面、評價：全台股總表（和 PEG 評分卡同一份）；技術面：個股日線算均線排列、季線、RSI14、ADX、扣抵門檻；
// 籌碼面：個股法人、融資資料待補（LAYOUT-SPEC 第 7 步）。0–100 的四面評分在第 7 步（js/scoring.js）。
// 參數：market、symbol；回傳 update({market, symbol})
(function () {
  const isNum = (x) => App.isNum(x);
  const row = (k, v, cls) => '<div class="sf-row"><span>' + k + '</span><b class="' + (cls || "") + '">' + v + "</b></div>";
  const pct = (x, d) => (isNum(x) ? App.fmtNum(x, d == null ? 1 : d) + "%" : "—");
  const last = (a) => { for (let i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return a[i]; return null; };

  function technical(p) {
    const c = p.close, n = c.length, price = c[n - 1];
    const s = Charts.maSettings().ma.filter((m) => m.on).map((m) => m.n).sort((a, b) => a - b);
    const mas = s.map((k) => ({ n: k, v: last(Ind.sma(c, k)) }));
    const ok = mas.filter((m) => isNum(m.v));
    let align = "—", cls = "";
    if (ok.length >= 3) {
      if (ok.every((m, i) => i === 0 || ok[i - 1].v > m.v)) { align = "多頭排列"; cls = "up"; }
      else if (ok.every((m, i) => i === 0 || ok[i - 1].v < m.v)) { align = "空頭排列"; cls = "down"; }
      else align = "糾結";
    }
    const q60 = last(Ind.sma(c, 60));
    const rsi = last(Ind.rsi(c, 14));
    const adx = last(Ind.dmi(p.high, p.low, c, 13, 13).adx);
    const above = ok.filter((m) => price > m.v).length;
    const d = ok.length ? Ind.deduction(c, ok[0].n, n - 1) : null;
    return row("均線（" + ok.map((m) => m.n).join("／") + "）", align, cls) +
      row("站上均線", above + "／" + ok.length + " 條", above === ok.length ? "up" : above === 0 ? "down" : "") +
      row("季線（MA60）", isNum(q60) ? (price >= q60 ? "站上 " : "跌破 ") + App.fmtPrice(q60) : "—", isNum(q60) ? (price >= q60 ? "up" : "down") : "") +
      row("RSI14", isNum(rsi) ? App.fmtNum(rsi, 1) + (rsi >= 70 ? "（過熱）" : rsi <= 30 ? "（超賣）" : "") : "—") +
      row("ADX", isNum(adx) ? App.fmtNum(adx, 1) + (adx >= 25 ? "（趨勢明確）" : "（盤整）") : "—") +
      (d ? row("MA" + ok[0].n + " 扣抵門檻", App.fmtPrice(d.value) + "（" + App.fmtPct(d.gapPct, true) + "）") : "");
  }

  Widgets.register("stockFaces", (el, o) => {
    el.classList.add("w-faces");
    let cur = { market: o.market === "us" ? "us" : "tw", symbol: String(o.symbol || "").toUpperCase() }, seq = 0;
    async function draw() {
      const my = ++seq;
      if (!cur.symbol) { el.innerHTML = '<p class="note">— 請先選一檔股票</p>'; return; }
      el.innerHTML = '<p class="note">讀取中…</p>';
      let item, d, s = null;
      try { item = await Data.item(cur.market, cur.symbol); d = await Data.stock(item); } catch (e) { if (my === seq) el.innerHTML = '<p class="note">— 讀不到 ' + App.esc(cur.symbol) + "（" + App.esc(e.message) + "）</p>"; return; }
      const m = App.marketOf(item), code = App.symbolOf(item).toUpperCase();
      try { s = (await (m === "tw" ? Data.twAll() : Data.usAll())).by.get(code) || null; } catch (e) {}
      if (my !== seq) return;
      const p = d.price, n = p.close.length, c = p.close[n - 1], ch = n > 1 ? (c / p.close[n - 2] - 1) * 100 : null;
      const name = (s && s.name) || d.name || item.name;
      const v = d.valuation || {};
      const fund = m === "tw" && s
        ? row("EPS（近四季）", App.fmtNum(s.eps_ttm, 2)) + row("EPS 成長", pct(s.eps_growth), App.upDown(s.eps_growth)) + row("月營收年增", pct(s.rev_yoy), App.upDown(s.rev_yoy)) +
          row("ROE", pct(s.roe)) + row("毛利率", pct(s.gross_margin)) + row("營益率", pct(s.op_margin))
        : row("EPS（近四季）", (() => { const q4 = (d.quarterly || []).slice(-4).map((x) => x.eps); return q4.length === 4 && q4.every(isNum) ? App.fmtNum(q4.reduce((a, b) => a + b, 0), 2) : "—"; })()) +
          row("毛利率", pct(d.quarterly && d.quarterly.length ? d.quarterly[d.quarterly.length - 1].gross_margin : null)) + '<p class="note">美股基本面欄位待補</p>';
      const peg = s && (isNum(s.peg) ? App.fmtNum(s.peg, 2) : isNum(s.peg_est) ? App.fmtNum(s.peg_est, 2) + "（推估）" : "—");
      const val = m === "tw" && s
        ? row("本益比", App.fmtNum(s.pe, 1)) + row("股價淨值比", App.fmtNum(s.pb, 2)) + row("PEG", peg, isNum(s.peg) && s.peg < 1 ? "up" : "") + row("殖利率", pct(s.yield, 2)) + row("股價營收比", App.fmtNum(s.psr, 2))
        : row("本益比", App.fmtNum(v.pe, 1)) + row("股價淨值比", App.fmtNum(v.pb, 2)) + row("殖利率", pct(v.dividend_yield, 2));
      let tech;
      try { tech = technical(p); } catch (e) { tech = '<p class="note">— 日線資料不夠</p>'; }
      el.innerHTML =
        '<div class="sf-head"><div><b class="sf-name">' + App.esc(name) + '</b> <span class="updated">' + (m === "us" ? "美股・" : "") + App.esc(code) + "</span></div>" +
        '<div><b class="sf-px ' + App.upDown(ch) + '">' + (m === "us" ? "$" : "") + App.fmtPrice(c) + '</b> <span class="' + App.upDown(ch) + '">' + App.fmtPct(ch, true) + '</span> <span class="updated">' + p.dates[n - 1] + "</span></div>" +
        '<div class="sf-act"><button type="button" class="btn primary" data-act="fav">＋ 加入自選</button> <a class="btn" href="stock.html?symbol=' + encodeURIComponent(code) + "&m=" + m + '">完整個股頁 →</a></div></div>' +
        '<div class="sf-grid">' +
          '<section class="sf-card"><h4>基本面</h4>' + fund + "</section>" +
          '<section class="sf-card"><h4>評價</h4>' + val + "</section>" +
          '<section class="sf-card"><h4>技術面</h4>' + tech + "</section>" +
          '<section class="sf-card"><h4>籌碼面</h4><p class="note">— 個股外資／投信 5 日、融資增減、大戶持股、借券資料待補（FinMind，LAYOUT-SPEC 第 7 步）。大盤法人在「籌碼面」分頁。</p></section>' +
        "</div><p class=\"updated sf-note\">四面 0–100 評分在第 7 步加入（公式會寫在頁面說明）。</p>";
      el.querySelector('[data-act="fav"]').addEventListener("click", (e) => AddFav.open(e.target, { m, code, name, market: item.market, exchange: item.exchange }));
    }
    draw();
    return { update(n) { const s = String(n.symbol || "").toUpperCase(); if (s && (s !== cur.symbol || (n.market && n.market !== "both" && n.market !== cur.market))) { cur = { market: n.market === "us" ? "us" : n.market === "tw" ? "tw" : cur.market, symbol: s }; draw(); } } };
  });
})();
