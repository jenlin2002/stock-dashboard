// 股票表格的欄位定義（全台股總表 all.html 與「我的追蹤」清單模式共用，兩邊欄位永遠一致）
// 每欄：k＝排序用的欄位、t＝標題、l＝靠左、asc＝預設由小到大（其餘數字欄預設由大到小）、f＝產生儲存格 HTML
(function () {
  const yi = (x) => (App.isNum(x) ? App.fmtNum(x / 1e8, Math.abs(x) >= 1e11 ? 0 : 1) : "—");  // 元 → 億
  const pctCell = (x) => '<span class="' + App.upDown(x) + '">' + App.fmtPct(x, true) + "</span>";

  // 台股：欄位來自 data/all/stocks.json；pegLv 是 PEG 的全市場五分位（Refs.levelsFor）
  function tw(pegLv) {
    return [
      { k: "code", t: "代號", l: true, asc: true, f: (s) => App.esc(s.code) },
      { k: "name", t: "名稱", l: true, asc: true, f: (s) => App.esc(s.name) },
      { k: "industry", t: "產業", l: true, asc: true, f: (s) => App.esc(s.industry) },
      { k: "market", t: "市場", l: true, asc: true, f: (s) => (s.market === "TWSE" ? "上市" : "上櫃") },
      { k: "close", t: "股價", f: (s) => App.fmtPrice(s.close) },
      { k: "change_pct", t: "漲跌", f: (s) => pctCell(s.change_pct) },
      { k: "volume", t: "成交量(張)", f: (s) => App.fmtNum(s.volume) },
      { k: "mktcap", t: "市值(億)", f: (s) => yi(s.mktcap) },
      { k: "pe", t: "本益比", asc: true, f: (s) => App.fmtNum(s.pe, 2) },
      // PEG：實際值；沒有時用推估值（灰字「估」，本益比 ÷ 累計營收成長）；都沒有就顯示原因
      { k: "peg_any", t: "PEG", asc: true, f: (s) => (App.isNum(s.peg) ? App.fmtNum(s.peg, 2) + " " + Refs.dot(pegLv[s.code], "PEG 和全市場比")
        : App.isNum(s.peg_est) ? '<span class="est" title="' + App.esc(s.peg_note) + '">' + App.fmtNum(s.peg_est, 2) + "<sup>估</sup></span> " + Refs.dot(pegLv[s.code], "推估 PEG 和全市場比")
        : '<span class="updated" title="' + App.esc(s.peg_note || "") + '">' + App.esc((s.peg_note || "—").split("，")[0]) + "</span>") },
      { k: "eps_growth", t: "EPS成長", f: (s) => pctCell(s.eps_growth) },
      { k: "roe", t: "ROE", f: (s) => App.fmtPct(s.roe) },
      { k: "yield", t: "殖利率", f: (s) => App.fmtPct(s.yield) },
      { k: "pb", t: "淨值比", asc: true, f: (s) => App.fmtNum(s.pb, 2) },
      { k: "psr", t: "營收比", asc: true, f: (s) => App.fmtNum(s.psr, 2) },
      { k: "debt_ratio", t: "負債比", asc: true, f: (s) => App.fmtPct(s.debt_ratio) },
      { k: "pcf", t: "現金流量比", asc: true, f: (s) => App.fmtNum(s.pcf, 2) },
      { k: "fcf_yield", t: "FCF殖利率", f: (s) => pctCell(s.fcf_yield) },
      { k: "fcf_ttm", t: "自由現金流(億)", f: (s) => yi(s.fcf_ttm) },
      { k: "rev", t: "月營收(億)", f: (s) => yi(s.rev) },
      { k: "rev_yoy", t: "營收YoY", f: (s) => pctCell(s.rev_yoy) },
      { k: "rev_cum_yoy", t: "累計YoY", f: (s) => pctCell(s.rev_cum_yoy) },
      { k: "eps_ttm", t: "近四季EPS", f: (s) => App.fmtNum(s.eps_ttm, 2) },
      { k: "eps_ytd", t: "今年EPS", f: (s) => App.fmtNum(s.eps_ytd, 2) + (s.eps_period ? ' <span class="updated">' + s.eps_period.slice(4) + "</span>" : "") },
      { k: "gross_margin", t: "毛利率", f: (s) => App.fmtPct(s.gross_margin) },
      { k: "op_margin", t: "營益率", f: (s) => App.fmtPct(s.op_margin) },
    ];
  }

  // 美股：欄位來自 data/summary.json（只有追蹤清單裡的美股）
  function us() {
    return [
      { k: "code", t: "代號", l: true, asc: true, f: (s) => App.esc(s.code) },
      { k: "name", t: "名稱", l: true, asc: true, f: (s) => App.esc(s.name) },
      { k: "close", t: "股價", f: (s) => (App.isNum(s.close) ? "$" + App.fmtPrice(s.close) : "—") },
      { k: "change_pct", t: "漲跌", f: (s) => pctCell(s.change_pct) },
      { k: "pe", t: "本益比", asc: true, f: (s) => App.fmtNum(s.pe, 2) },
      { k: "yield", t: "殖利率", f: (s) => App.fmtPct(s.yield) },
      { k: "pb", t: "淨值比", asc: true, f: (s) => App.fmtNum(s.pb, 2) },
      { k: "eps_ttm", t: "近四季EPS", f: (s) => App.fmtNum(s.eps_ttm, 2) },
      { k: "gross_margin", t: "毛利率", f: (s) => App.fmtPct(s.gross_margin) },
      { k: "op_margin", t: "營益率", f: (s) => App.fmtPct(s.op_margin) },
      { k: "quarter", t: "財報季", l: true, asc: true, f: (s) => App.esc(s.quarter || "—") },
    ];
  }

  // summary.json 的美股列 → 和台股同樣的欄位名稱
  function fromSummary(x) {
    return { code: x.symbol, name: x.name, close: x.price, change_pct: x.change_pct, pe: x.pe, pb: x.pb, yield: x.dividend_yield,
      eps_ttm: x.eps_ttm, gross_margin: x.gross_margin, op_margin: x.operating_margin, quarter: x.quarter };
  }

  // 近一年走勢小圖（紅漲綠跌，以一年前比較）
  function spark(closes, w, h) {
    w = w || 140; h = h || 34;
    const c = (closes || []).filter(App.isNum);
    const n = c.length;
    if (n < 2) return '<span class="updated">—</span>';
    const min = Math.min(...c), max = Math.max(...c);
    const pts = c.map((x, i) => (i / (n - 1) * w).toFixed(1) + "," + (h - 2 - (x - min) / (max - min || 1) * (h - 4)).toFixed(1)).join(" ");
    const cls = App.upDown(c[n - 1] - c[0]) || "muted";
    const pct = (c[n - 1] / c[0] - 1) * 100;
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="近一年 ' + App.fmtPct(pct, true) + '">' +
      "<title>近一年 " + App.fmtPct(pct, true) + "</title>" +
      '<polyline points="' + pts + '" fill="none" stroke="var(--' + cls + ')" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';
  }

  window.StockCols = { tw, us, fromSummary, spark, yi, pctCell };
})();
