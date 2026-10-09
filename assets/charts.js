// 用自己的資料（data/*.json）畫圖：K 線用 lightweight-charts，其餘用 Chart.js。顏色紅漲綠跌。
(function () {
  const v = App.cssVar;
  let chartjs = [];   // 目前畫著的 Chart.js 圖，重畫前要先 destroy
  let klines = [];    // 目前畫著的 lightweight-charts

  function rgba(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }

  function destroyAll() {
    chartjs.forEach((c) => c.destroy());
    klines.forEach((c) => c.remove());
    chartjs = [];
    klines = [];
  }

  // ---------- K 線（上市股票 TradingView 不給，改用 FinMind 日 K） ----------

  function movingAverage(close, dates, n) {
    const out = [];
    let sum = 0;
    for (let i = 0; i < close.length; i++) {
      sum += close[i];
      if (i >= n) sum -= close[i - n];
      if (i >= n - 1) out.push({ time: dates[i], value: +(sum / n).toFixed(2) });
    }
    return out;
  }

  function kline(host, d) {
    const p = d.price;
    const up = v("--up"), down = v("--down"), muted = v("--muted"), grid = v("--grid");
    host.innerHTML = "";
    const chart = LightweightCharts.createChart(host, {
      autoSize: true,
      layout: { background: { type: "solid", color: v("--card") }, textColor: muted, fontSize: 12 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: v("--border") },
      timeScale: { borderColor: v("--border") },
      localization: { locale: "zh-TW" },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    });
    const candle = chart.addCandlestickSeries({
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
    candle.setData(p.dates.map((t, i) => ({ time: t, open: p.open[i], high: p.high[i], low: p.low[i], close: p.close[i] })));

    const ma20 = chart.addLineSeries({ color: v("--series-2"), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma20.setData(movingAverage(p.close, p.dates, 20));
    const ma60 = chart.addLineSeries({ color: v("--series-3"), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma60.setData(movingAverage(p.close, p.dates, 60));

    // 成交量：台股換算成「張」
    const lot = d.market === "TW" ? 1000 : 1;
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(p.dates.map((t, i) => ({
      time: t,
      value: Math.round(p.volume[i] / lot),
      color: rgba(p.close[i] >= p.open[i] ? up : down, 0.45),
    })));

    const n = p.dates.length;
    chart.timeScale().setVisibleLogicalRange({ from: n - 130, to: n + 2 });  // 預設看近半年，可拖曳、縮放
    klines.push(chart);
    return chart;
  }

  // ---------- Chart.js 共用設定 ----------

  function base(extra) {
    Chart.defaults.color = v("--muted");
    Chart.defaults.borderColor = v("--grid");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12 } } },
    }, extra);
  }

  function pctAxis(position) {
    return { position: position, grid: { drawOnChartArea: position === "left" }, ticks: { callback: (x) => x + "%" } };
  }

  function make(canvas, config) {
    const c = new Chart(canvas, config);
    chartjs.push(c);
    return c;
  }

  // ---------- 月營收（台股）：長條＝營收、折線＝YoY ----------

  function revenue(canvas, d, months) {
    const rows = (d.monthly_revenue || []).slice(-(months || 36));
    const unit = App.revenueUnit(d.market);
    return make(canvas, {
      data: {
        labels: rows.map((r) => r.month.slice(2).replace("-", "/")),
        datasets: [
          { type: "bar", label: "營收（" + unit.label + "）", data: rows.map((r) => r.revenue / unit.div), backgroundColor: rgba(v("--series-1"), 0.75), yAxisID: "y", order: 2 },
          { type: "line", label: "年增率 YoY", data: rows.map((r) => r.yoy), borderColor: v("--series-2"), backgroundColor: v("--series-2"), pointRadius: 0, borderWidth: 2, tension: 0.25, yAxisID: "y1", order: 1 },
        ],
      },
      options: base({
        scales: { y: { position: "left", beginAtZero: true }, y1: pctAxis("right") },
        plugins: {
          legend: { labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "y1" ? " YoY " + App.fmtPct(c.raw, true) : " 營收 " + App.fmtRevenue(rows[c.dataIndex].revenue, d.market) } },
        },
      }),
    });
  }

  // ---------- 季度：營收＋毛利率／營益率、EPS ----------

  function quarterLabel(q) {
    return q.fiscal ? q.fiscal.replace("FY20", "FY") : q.period;  // 美股用財報季（FY27 Q2）
  }

  function margin(a, b) { return App.isNum(a) && b ? +(a / b * 100).toFixed(2) : null; }

  function quarterly(canvas, d, n) {
    const rows = (d.quarterly || []).slice(-(n || 8));
    const unit = App.revenueUnit(d.market);
    return make(canvas, {
      data: {
        labels: rows.map(quarterLabel),
        datasets: [
          { type: "bar", label: "營收（" + unit.label + "）", data: rows.map((r) => r.revenue / unit.div), backgroundColor: rgba(v("--series-1"), 0.75), yAxisID: "y", order: 3 },
          { type: "line", label: "毛利率", data: rows.map((r) => margin(r.gross_profit, r.revenue)), borderColor: v("--series-2"), backgroundColor: v("--series-2"), borderWidth: 2, pointRadius: 3, yAxisID: "y1", order: 1 },
          { type: "line", label: "營益率", data: rows.map((r) => margin(r.operating_income, r.revenue)), borderColor: v("--series-3"), backgroundColor: v("--series-3"), borderWidth: 2, pointRadius: 3, yAxisID: "y1", order: 2 },
        ],
      },
      options: base({
        scales: { y: { position: "left", beginAtZero: true }, y1: pctAxis("right") },
        plugins: {
          legend: { labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              title: (items) => { const r = rows[items[0].dataIndex]; return quarterLabel(r) + (r.end ? "（至 " + r.end + "）" : ""); },
              label: (c) => c.dataset.yAxisID === "y1" ? " " + c.dataset.label + " " + App.fmtPct(c.raw) : " 營收 " + App.fmtRevenue(rows[c.dataIndex].revenue, d.market),
            },
          },
        },
      }),
    });
  }

  function eps(canvas, d, n) {
    const rows = (d.quarterly || []).slice(-(n || 8));
    const up = v("--up"), down = v("--down");
    return make(canvas, {
      type: "bar",
      data: {
        labels: rows.map(quarterLabel),
        datasets: [{
          label: "EPS（" + (d.market === "TW" ? "元" : "美元") + "）",
          data: rows.map((r) => r.eps),
          // 與去年同季比：成長紅、衰退綠
          backgroundColor: rows.map((r, i) => {
            const all = d.quarterly, j = all.length - rows.length + i - 4;
            const prev = j >= 0 ? all[j].eps : null;
            return rgba(!App.isNum(prev) || r.eps === prev ? v("--series-1") : r.eps > prev ? up : down, 0.75);
          }),
        }],
      },
      options: base({
        scales: { y: { beginAtZero: true, title: { display: true, text: d.market === "TW" ? "元" : "美元" } } },
        plugins: { legend: { display: false } },  // 柱子顏色代表成長／衰退，圖例方塊會誤導
      }),
    });
  }

  window.Charts = { kline, revenue, quarterly, eps, destroyAll, quarterLabel };
})();
