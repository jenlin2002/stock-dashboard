// 區塊：個股四面分析（基本面、評價、技術面、籌碼面）＋加入自選。
// 基本面、評價：全台股總表（和 PEG 評分卡同一份）；技術面：個股日線算均線排列、季線、RSI14、ADX、扣抵門檻；
// 籌碼面：外資連買、法人 5 日、融資增減（data/screener-tw.json）。0–100 四面評分：assets/scoring.js。
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

  // 籌碼面（data/screener-tw.json 合併進全台股總表的欄位）；沒有資料就說明待補
  const lots = (x) => (isNum(x) ? (x > 0 ? "+" : x < 0 ? "−" : "") + App.fmtNum(Math.abs(x), 0) + " 張" : "—");
  function chips(s) {
    if (!s || !isNum(s.fi_5)) return '<p class="note">— 個股法人、融資資料還沒有（data/screener-tw.json，排程每天收盤後產生）。</p>';
    return row("外資連" + (s.fi_days >= 0 ? "買" : "賣"), isNum(s.fi_days) ? Math.abs(s.fi_days) + " 日" : "—", App.upDown(s.fi_days)) +
      row("外資 5 日", lots(s.fi_5), App.upDown(s.fi_5)) + row("投信 5 日", lots(s.it_5), App.upDown(s.it_5)) + row("自營商 5 日", lots(s.dl_5), App.upDown(s.dl_5)) +
      row("融資 1 日增減", lots(s.mg_chg)) + row("融資 5 日增減", lots(s.mg_chg5)) +
      row("大戶持股（≥1,000 張）", isNum(s.big_pct) ? App.fmtNum(s.big_pct, 2) + "%" + (isNum(s.big_chg) ? "（週 " + (s.big_chg > 0 ? "+" : "") + App.fmtNum(s.big_chg, 2) + "）" : "") : "—", App.upDown(s.big_chg)) +
      row("借券賣出餘額", isNum(s.sbl) ? App.fmtNum(s.sbl, 0) + " 張" + (isNum(s.sbl_chg5) ? "（5 日 " + lots(s.sbl_chg5) + "）" : "") : "—") +
      (isNum(s.eps_up_q) ? row("單季 EPS 年增", s.eps_up_q + " 季連續" + (isNum(s.eps_q_yoy) ? "（最新 " + App.fmtPct(s.eps_q_yoy, true) + "）" : ""), s.eps_up_q >= 3 ? "up" : "") : "");
  }
  window.StockFaces = { technical, chips };  // C 版個股抽屜也用

  // 區塊：個股籌碼卡（B 版「籌碼面」分頁）：參數 market、symbol
  Widgets.register("chipCard", (el, o) => {
    el.classList.add("w-chipcard");
    let cur = null, seq = 0;
    async function draw(market, symbol) {
      const my = ++seq;
      cur = { market, symbol };
      if (!symbol || market === "us" || !/^\d/.test(symbol)) { el.innerHTML = '<div class="w-head"><h3>個股籌碼</h3></div><p class="note" style="padding:0 14px 12px">— 只有台股有法人、融資、大戶、借券資料</p>'; return; }
      let s = null, t = null;
      try { t = await Data.twAll(); s = t.by.get(String(symbol).toUpperCase()) || null; } catch (e) {}
      if (my !== seq) return;
      el.innerHTML = '<div class="w-head"><h3>個股籌碼：' + App.esc((s && s.name) || symbol) + " " + App.esc(symbol) + '</h3><span class="updated">' + (t && t.screener ? "法人、融資 " + t.screener.inst_date : "") + '</span></div><div class="sf-card" style="margin:0 14px 14px">' + chips(s) + "</div>";
    }
    draw(o.market, o.symbol);
    return { update(n) { if (n.symbol && (!cur || n.symbol !== cur.symbol)) draw(n.market, n.symbol); } };
  });

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
      let twRows = null;
      try { const t = await (m === "tw" ? Data.twAll() : Data.usAll()); s = t.by.get(code) || null; if (m === "tw") twRows = t.rows; } catch (e) {}
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
          '<section class="sf-card"><h4>籌碼面</h4>' + (m === "tw" ? chips(s) : '<p class="note">— 美股沒有法人、融資資料</p>') + "</section>" +
        "</div>" + (m === "tw" ? (() => {
          let f = null;
          try { f = Scoring.faces(twRows).get(code); } catch (e) {}
          return f ? '<div class="sf-score">' + [["fund", "基本面"], ["value", "評價"], ["tech", "技術面"], ["chip", "籌碼面"]].map(([k, t]) => '<span>' + t + " <b>" + (isNum(f[k]) ? f[k] : "—") + "</b></span>").join("") +
            '<span class="updated">四面評分 0–100（全市場百分位，公式見頁尾）</span></div>' : "";
        })() : "");
      el.querySelector('[data-act="fav"]').addEventListener("click", (e) => AddFav.open(e.target, { m, code, name, market: item.market, exchange: item.exchange }));
    }
    draw();
    return { update(n) { const s = String(n.symbol || "").toUpperCase(); if (s && (s !== cur.symbol || (n.market && n.market !== "both" && n.market !== cur.market))) { cur = { market: n.market === "us" ? "us" : n.market === "tw" ? "tw" : cur.market, symbol: s }; draw(); } } };
  });
})();
