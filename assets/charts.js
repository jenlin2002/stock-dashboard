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

  function destroyKlines() {
    klines.forEach((c) => c.remove());
    klines = [];
  }

  function destroyAll() {
    chartjs.forEach((c) => c.destroy());
    chartjs = [];
    destroyKlines();
  }

  // ---------- K 線＋技術指標（所有股票都用自己的日 K 資料） ----------

  // 均線顏色避開紅綠（紅綠代表漲跌）
  const MAS = [8, 21, 55, 89];  // 本人指定的均線
  const MA_COLORS = { 8: "#f59f00", 21: "#22b8cf", 55: "#1c7ed6", 89: "#ae3ec9" };
  const VOL_MA = [5, 13, 34];   // 本人指定的均量
  const VOL_COLORS = { 5: "#f59f00", 13: "#22b8cf", 34: "#ae3ec9" };
  const SUB_COLORS = ["#f59f00", "#1c7ed6"];
  const DMI_N = 13;

  function chartOptions(extra) {
    return Object.assign({
      autoSize: true,
      layout: { background: { type: "solid", color: v("--card") }, textColor: v("--muted"), fontSize: 12 },
      grid: { vertLines: { color: v("--grid") }, horzLines: { color: v("--grid") } },
      rightPriceScale: { borderColor: v("--border"), minimumWidth: 72 },  // 主圖、副圖右側同寬才對得齊
      timeScale: { borderColor: v("--border") },
      localization: { locale: "zh-TW" },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    }, extra || {});
  }

  // 陣列 → lightweight-charts 資料；null 的位置放空白點，讓主圖、副圖的 K 棒序號一致
  function series(dates, arr, digits) {
    return dates.map((t, i) => (arr[i] == null ? { time: t } : { time: t, value: +arr[i].toFixed(digits == null ? 2 : digits) }));
  }

  function line(chart, color, extra) {
    return chart.addLineSeries(Object.assign({
      color: color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    }, extra || {}));
  }

  // opts：{ ma: [5, 20, 60], deduct: true, sub: "kd" | "macd" | "none" }
  // 回傳 { legend(i) } 讓頁面顯示游標所在那天的數值
  // 日 K 的 dates 是 "YYYY-MM-DD"；分鐘 K 是時間戳（秒，已換成交易所當地時間），要顯示時、分
  function kline(host, subHost, d, opts) {
    const p = d.price, n = p.dates.length;
    const up = v("--up"), down = v("--down");
    const intraday = typeof p.dates[0] === "number";
    const tsOpt = intraday ? { timeScale: { borderColor: v("--border"), timeVisible: true, secondsVisible: false } } : {};
    host.innerHTML = "";
    subHost.innerHTML = "";
    const chart = LightweightCharts.createChart(host, chartOptions(tsOpt));
    klines.push(chart);

    const candle = chart.addCandlestickSeries({
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
    candle.setData(p.dates.map((t, i) => ({ time: t, open: p.open[i], high: p.high[i], low: p.low[i], close: p.close[i] })));

    const values = {};  // 給圖例用
    for (const m of opts.ma) {
      const arr = Ind.sma(p.close, m);
      values["MA" + m] = arr;
      line(chart, MA_COLORS[m]).setData(series(p.dates, arr));
    }

    // 扣抵（動態）：以游標所在的 K 棒為「今天」，在每條均線的扣抵 K 棒上標箭頭，並畫扣抵價位線
    let priceLines = [], deductAt = -1;
    function showDeduction(t) {
      if (!opts.deduct || t === deductAt) return;
      deductAt = t;
      priceLines.forEach((l) => candle.removePriceLine(l));
      priceLines = [];
      const markers = [];
      for (const m of opts.ma) {
        const info = Ind.deduction(p.close, m, t);
        if (!info) continue;
        markers.push({ time: p.dates[info.index], position: "aboveBar", color: MA_COLORS[m], shape: "arrowDown", text: m + "扣 " + App.fmtPrice(info.value) });
        priceLines.push(candle.createPriceLine({ price: info.value, color: MA_COLORS[m], lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: m + "扣" }));
      }
      markers.sort((a, b) => (a.time < b.time ? -1 : 1));
      candle.setMarkers(markers);
      // 均量扣抵：標在成交量柱上
      const vmarkers = [];
      for (const m of VOL_MA) {
        const info = Ind.deduction(volArr, m, t);
        if (info) vmarkers.push({ time: p.dates[info.index], position: "aboveBar", color: VOL_COLORS[m], shape: "arrowDown", text: "量" + m + "扣" });
      }
      vmarkers.sort((a, b) => (a.time < b.time ? -1 : 1));
      vol.setMarkers(vmarkers);
    }

    // 成交量（台股換算成「張」）＋ 5 日、20 日均量
    const lot = d.market === "TW" ? 1000 : 1;
    const volArr = p.volume.map((x) => x / lot);
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(p.dates.map((t, i) => ({ time: t, value: Math.round(volArr[i]), color: rgba(p.close[i] >= p.open[i] ? up : down, 0.45) })));
    VOL_MA.forEach((m) => {
      values["VMA" + m] = Ind.sma(volArr, m);
      line(chart, VOL_COLORS[m], { priceScaleId: "vol" }).setData(series(p.dates, values["VMA" + m], 0));
    });
    values.vol = volArr;

    // 副圖：KD 或 MACD，時間軸與主圖同步
    let sub = null;
    subHost.hidden = opts.sub === "none";
    if (opts.sub === "dmi") {
      sub = LightweightCharts.createChart(subHost, chartOptions(tsOpt));
      const r = Ind.dmi(p.high, p.low, p.close, DMI_N, DMI_N);
      line(sub, up, { lineWidth: 2 }).setData(series(p.dates, r.plus));
      line(sub, down, { lineWidth: 2 }).setData(series(p.dates, r.minus));
      const adx = line(sub, "#1c7ed6", { lineWidth: 2 });
      adx.setData(series(p.dates, r.adx));
      adx.createPriceLine({ price: 25, color: v("--muted"), lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false });
      values.PDI = r.plus; values.MDI = r.minus; values.ADX = r.adx;
    } else if (opts.sub === "rsi") {
      sub = LightweightCharts.createChart(subHost, chartOptions(tsOpt));
      const r6 = Ind.rsi(p.close, 6), r12 = Ind.rsi(p.close, 12);
      const a = line(sub, SUB_COLORS[0], { lineWidth: 2 });
      a.setData(series(p.dates, r6));
      line(sub, SUB_COLORS[1], { lineWidth: 2 }).setData(series(p.dates, r12));
      [70, 50, 30].forEach((lv) => a.createPriceLine({ price: lv, color: v("--muted"), lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: lv !== 50 }));
      values.RSI6 = r6; values.RSI12 = r12;
    } else if (opts.sub === "kd") {
      sub = LightweightCharts.createChart(subHost, chartOptions(tsOpt));
      const r = Ind.kd(p.high, p.low, p.close, 9, 3, 3);
      const k = line(sub, SUB_COLORS[0], { lineWidth: 2 });
      k.setData(series(p.dates, r.K));
      line(sub, SUB_COLORS[1], { lineWidth: 2 }).setData(series(p.dates, r.D));
      k.createPriceLine({ price: 80, color: v("--muted"), lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false });
      k.createPriceLine({ price: 20, color: v("--muted"), lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false });
      values.K = r.K; values.D = r.D;
    } else if (opts.sub === "macd") {
      sub = LightweightCharts.createChart(subHost, chartOptions(tsOpt));
      const r = Ind.macd(p.close, 12, 26, 9);
      sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
        .setData(p.dates.map((t, i) => (r.osc[i] == null ? { time: t } : { time: t, value: +r.osc[i].toFixed(3), color: rgba(r.osc[i] >= 0 ? up : down, 0.6) })));
      line(sub, SUB_COLORS[0], { lineWidth: 2 }).setData(series(p.dates, r.dif, 3));
      line(sub, SUB_COLORS[1], { lineWidth: 2 }).setData(series(p.dates, r.sig, 3));
      values.DIF = r.dif; values.MACD = r.sig; values.OSC = r.osc;
    }
    if (sub) {
      klines.push(sub);
      // 兩張圖的可視範圍互相同步（拖曳、縮放任一張都會帶動另一張）
      let syncing = false;
      const link = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        b.timeScale().setVisibleLogicalRange(range);
        syncing = false;
      });
      link(chart, sub);
      link(sub, chart);
    }

    chart.timeScale().setVisibleLogicalRange({ from: n - 130, to: n + 2 });  // 預設看近半年
    if (sub) sub.timeScale().setVisibleLogicalRange({ from: n - 130, to: n + 2 });

    // 游標移動時回報是第幾根 K 棒，沒有游標時回報最後一根。
    // opts.track === false（「查價」沒打勾）：游標只顯示十字線，數值與扣抵固定在最新一根
    const listeners = [];
    const report = (param, fromMain) => {
      const onBar = param && param.logical != null && param.logical >= 0 && param.logical < n;
      const i = opts.track !== false && onBar ? Math.round(param.logical) : n - 1;
      showDeduction(i);
      listeners.forEach((fn) => fn(i));
      // 「查價」打勾：在滑鼠指到的 K 棒旁顯示資訊小框（只在主圖上）
      if (opts.track !== false && onBar && fromMain && param.point) showTip(Math.round(param.logical), param.point);
      else tip.style.display = "none";
    };
    chart.subscribeCrosshairMove((p) => report(p, true));
    if (sub) sub.subscribeCrosshairMove((p) => report(p, false));

    // 資訊小框：日期、開高低收、漲跌、量、各均線
    const tip = document.createElement("div");
    tip.className = "k-tip";
    tip.style.display = "none";
    host.appendChild(tip);
    const volUnit = d.volUnit != null ? d.volUnit : d.market === "TW" ? "張" : "";
    const f2 = (x) => (App.isNum(x) ? App.fmtNum(x, Math.abs(x) >= 1000 ? 0 : 2) : "—");
    function showTip(i, pt) {
      const chg = i > 0 ? (p.close[i] / p.close[i - 1] - 1) * 100 : null;
      const cls = App.upDown(chg);
      let html = '<div class="k-tip-d">' + timeLabel(p.dates[i]) + "</div>" +
        "<div>開 <b>" + f2(p.open[i]) + "</b></div><div>高 <b>" + f2(p.high[i]) + "</b></div><div>低 <b>" + f2(p.low[i]) + "</b></div>" +
        '<div>收 <b class="' + cls + '">' + f2(p.close[i]) + "</b> " + '<span class="' + cls + '">' + App.fmtPct(chg, true) + "</span></div>" +
        "<div>量 <b>" + App.fmtNum(values.vol[i], 0) + "</b> " + volUnit + "</div>";
      opts.ma.forEach((m) => { html += '<div style="color:' + MA_COLORS[m] + '">MA' + m + " <b>" + f2(values["MA" + m][i]) + "</b></div>"; });
      tip.innerHTML = html;
      tip.style.display = "block";
      // 放在游標右下，靠近邊緣就換到左邊／上面
      const W = host.clientWidth, H = host.clientHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = pt.x + 16, y = pt.y + 16;
      if (x + tw > W - 80) x = pt.x - tw - 16;   // 右邊留給價格座標
      if (y + th > H) y = Math.max(0, pt.y - th - 16);
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = y + "px";
    }
    showDeduction(n - 1);

    return { values, volArr, onCrosshair: (fn) => { listeners.push(fn); fn(n - 1); } };
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

  // 日 K 合併成週 K（W，週一開始）或月 K（M）；時間用該週／月第一個交易日
  function aggregate(p, unit) {
    const out = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
    let key = null;
    p.dates.forEach((dt, i) => {
      let k;
      if (unit === "M") k = dt.slice(0, 7);
      else {
        const t = new Date(dt + "T00:00:00Z");
        t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));  // 該週週一
        k = t.toISOString().slice(0, 10);
      }
      const j = out.dates.length - 1;
      if (k !== key) {
        key = k;
        out.dates.push(dt); out.open.push(p.open[i]); out.high.push(p.high[i]);
        out.low.push(p.low[i]); out.close.push(p.close[i]); out.volume.push(p.volume[i]);
      } else {
        out.high[j] = Math.max(out.high[j], p.high[i]);
        out.low[j] = Math.min(out.low[j], p.low[i]);
        out.close[j] = p.close[i];
        out.volume[j] += p.volume[i];
      }
    });
    return out;
  }

  // 圖例、表格用的時間文字：日 K 原樣；分鐘 K 顯示「10-08 13:25」
  function timeLabel(t) {
    if (typeof t !== "number") return t;
    return new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");
  }

  window.Charts = {
    aggregate, timeLabel, destroyKlines, kline, revenue, quarterly, eps, destroyAll, quarterLabel, MAS, MA_COLORS, VOL_MA, VOL_COLORS, SUB_COLORS, DMI_N };
})();
