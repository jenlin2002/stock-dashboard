// 扣抵表：勾選的均線＋均量，以第 t 根 K 棒為「今天」（和個股頁同一套規則：assets/indicators.js 的 Ind.deduction）。
// DeductTable.html(p, t, opts)：p＝{dates, close, volume}；opts：{ ma, volMa（Charts.maSettings 的清單）, lot（台股 1000）, tfName }
// 區塊 "deduct"：參數 market、symbol；用日線最新一根。
(function () {
  function html(p, t, o) {
    const ma = o.ma || [], vma = o.volMa || [], lot = o.lot || 1;
    const close = p.close, volArr = p.volume.map((x) => x / lot), last = close[t], lastVol = volArr[t];
    const colorOf = (list, n) => (list.find((m) => m.n === n) || {}).color;
    const trendCell = (r, fmt) => '<td><b class="' + (r.trend === "扣低" ? "up" : r.trend === "扣高" ? "down" : "") + '">' + r.trend + '</b> <span class="updated">' + r.next5.map(fmt).join("、") + "</span></td>";
    const priceRows = ma.map((m) => Ind.deduction(close, m.n, t)).filter(Boolean).map((r) =>
      '<tr><td><i class="dot" style="background:' + colorOf(ma, r.n) + '"></i>MA' + r.n + "</td>" +
      "<td>" + App.fmtPrice(r.ma) + (last > r.ma ? '<span class="up"> 價在線上</span>' : '<span class="down"> 價在線下</span>') + "</td>" +
      "<td>" + App.fmtPrice(r.value) + "</td>" +
      '<td class="' + App.upDown(r.dir) + '">' + (r.dir > 0 ? "上揚 ↗" : r.dir < 0 ? "下彎 ↘" : "持平") + "</td>" +
      "<td>收盤" + (r.dir >= 0 ? "跌破 " : "站上 ") + App.fmtPrice(r.value) + "（" + App.fmtPct(r.gapPct, true) + "）</td>" +
      trendCell(r, App.fmtPrice) + "</tr>");
    const vf = (x) => App.fmtNum(x, 0);
    const volRows = vma.map((m) => Ind.deduction(volArr, m.n, t)).filter(Boolean).map((r) =>
      '<tr><td><i class="dot" style="background:' + colorOf(vma, r.n) + '"></i>均量' + r.n + "</td>" +
      "<td>" + vf(r.ma) + (lastVol > r.ma ? '<span class="up"> 量大於均量</span>' : '<span class="down"> 量小於均量</span>') + "</td>" +
      "<td>" + vf(r.value) + "</td>" +
      '<td class="' + App.upDown(r.dir) + '">' + (r.dir > 0 ? "均量增 ↗" : r.dir < 0 ? "均量減 ↘" : "持平") + "</td>" +
      "<td>量" + (r.dir >= 0 ? "低於 " : "高於 ") + vf(r.value) + "</td>" +
      trendCell(r, vf) + "</tr>");
    if (!priceRows.length && !volRows.length) return "";
    return '<table><thead><tr><th>以 ' + Charts.timeLabel(p.dates[t]) + " 為基準（" + (o.tfName || "日") + '線）</th><th>目前值</th><th>下一根扣抵值</th><th>下一根方向（收盤／量不變）</th><th>轉向門檻</th><th>接下來 5 根扣抵</th></tr></thead><tbody>' +
      priceRows.join("") + volRows.join("") + "</tbody></table>";
  }
  window.DeductTable = { html };

  Widgets.register("deduct", (el, o) => {
    el.classList.add("w-deduct");
    let seq = 0;
    async function draw(market, symbol) {
      const my = ++seq;
      if (!symbol) { el.innerHTML = '<p class="note">— 沒有指定股票</p>'; return; }
      el.innerHTML = '<p class="note">讀取中…</p>';
      try {
        const item = await Data.item(market, symbol);
        const d = await Data.stock(item);
        if (my !== seq) return;
        const s = Charts.maSettings(), p = d.price, n = p.dates.length;
        const t = html(p, n - 1, { ma: s.ma.filter((x) => x.on), volMa: s.vol.filter((x) => x.on), lot: d.market === "TW" ? 1000 : 1, tfName: "日" });
        el.innerHTML = t ? '<div class="table-wrap">' + t + "</div>" : '<p class="note">— 日線資料不夠算扣抵</p>';
      } catch (e) { if (my === seq) el.innerHTML = '<p class="note">— 讀不到資料（' + App.esc(e.message) + "）</p>"; }
    }
    let cur = { market: o.market, symbol: o.symbol };
    draw(cur.market, cur.symbol);
    return { update(n) { if (n.symbol && (n.symbol !== cur.symbol || n.market !== cur.market)) { cur = { market: n.market, symbol: n.symbol }; draw(cur.market, cur.symbol); } } };
  });
})();
