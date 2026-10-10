// 四面評分（0–100，越高越好）。公式（頁面說明也照這裡寫）：
//   基本面＝全市場百分位的平均：ROE、EPS 成長率（近四季對前四季）、月營收年增率
//   評價  ＝全市場百分位的平均（越便宜分數越高）：本益比（只算正的）、PEG（沒有用推估 PEG，只算正的）、殖利率
//   技術面、籌碼面：需要每檔的歷史股價、法人與融資資料，第 7 步補資料後加入；現在是 null（顯示「—」）
// 百分位：在有資料的股票中排第幾（0＝最差、100＝最好）；沒有資料的那一項不算進平均，三項都沒有就是 null。
(function () {
  const isNum = (x) => App.isNum(x);
  const pegOf = (s) => (isNum(s.peg) ? s.peg : s.peg_est);
  function rank(rows, get, higher) {
    const list = rows.map((s) => [s.code, get(s)]).filter(([, v]) => isNum(v));
    list.sort((a, b) => a[1] - b[1]);
    const out = new Map(), n = list.length;
    list.forEach(([c], i) => out.set(c, n > 1 ? (higher ? i : n - 1 - i) / (n - 1) * 100 : 50));
    return out;
  }
  const avg = (a) => { const v = a.filter(isNum); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
  const memo = new WeakMap();
  // rows：全台股總表的物件陣列 → Map(code → { fund, value, tech, chip })
  function faces(rows) {
    if (memo.has(rows)) return memo.get(rows);
    const r = {
      roe: rank(rows, (s) => s.roe, true), eg: rank(rows, (s) => s.eps_growth, true), rv: rank(rows, (s) => s.rev_yoy, true),
      pe: rank(rows, (s) => (s.pe > 0 ? s.pe : null), false), peg: rank(rows, (s) => (pegOf(s) > 0 ? pegOf(s) : null), false), yd: rank(rows, (s) => s.yield, true),
    };
    const out = new Map(rows.map((s) => [s.code, {
      fund: avg([r.roe.get(s.code), r.eg.get(s.code), r.rv.get(s.code)]),
      value: avg([r.pe.get(s.code), r.peg.get(s.code), r.yd.get(s.code)]),
      tech: null, chip: null,
    }]));
    memo.set(rows, out);
    return out;
  }
  const LABELS = [["fund", "基"], ["value", "價"], ["tech", "技"], ["chip", "籌"]];
  // 四個小圓點（滿的比例＝分數），沿用 PEG 評分卡的 refs-dot 樣式
  function dots(f) {
    return '<span class="sc-dots">' + LABELS.map(([k, t]) => {
      const v = f && f[k];
      return '<span class="sc-dot" title="' + t + (isNum(v) ? "：" + v + " 分" : "：資料待補") + '"><i class="refs-dot' + (isNum(v) ? "" : " na") + '" style="--f:' + (isNum(v) ? v : 0) + '%">' + (isNum(v) ? "" : "–") + "</i>" + t + "</span>";
    }).join("") + "</span>";
  }
  // 圓環（抽屜用）
  function ring(label, v) {
    const p = isNum(v) ? v : 0;
    return '<div class="sc-ring" title="' + label + (isNum(v) ? "：" + v + " 分" : "：資料待補") + '"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="r-bg"/>' +
      (isNum(v) ? '<circle cx="18" cy="18" r="15.5" class="r-fg" stroke-dasharray="' + (p * 0.974).toFixed(1) + ' 100"/>' : "") +
      '</svg><b>' + (isNum(v) ? v : "—") + "</b><span>" + label + "</span></div>";
  }
  window.Scoring = { faces, dots, ring, LABELS, pegOf };
})();
