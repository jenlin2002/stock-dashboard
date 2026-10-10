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

  // ---------- K 線＋技術指標 ----------

  // 均線、均量設定：本人可自訂天數、顏色、粗細、開關（存在瀏覽器 ma-settings，個股頁和大盤頁共用）。
  // 預設 MA 8/21/55/89、均量 5/13/34；顏色避開紅綠（紅綠代表漲跌）
  const DEFAULT_MA = {
    ma: [
      { n: 8, color: "#f59f00", width: 1, on: true }, { n: 21, color: "#22b8cf", width: 1, on: true },
      { n: 55, color: "#1c7ed6", width: 1, on: true }, { n: 89, color: "#ae3ec9", width: 1, on: true },
    ],
    vol: [
      { n: 5, color: "#f59f00", width: 1, on: true }, { n: 13, color: "#22b8cf", width: 1, on: true }, { n: 34, color: "#ae3ec9", width: 1, on: true },
    ],
  };
  function maSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem("ma-settings") || "null"); } catch (e) {}
    const ok = (list) => Array.isArray(list) && list.every((x) => Number.isInteger(x.n) && x.n >= 2 && x.n <= 500 && /^#[0-9a-f]{6}$/i.test(x.color));
    return s && ok(s.ma) && ok(s.vol) ? s : JSON.parse(JSON.stringify(DEFAULT_MA));
  }
  function saveMaSettings(s) {
    try { localStorage.setItem("ma-settings", JSON.stringify(s)); } catch (e) {}
  }
  const SUB_COLORS = ["#f59f00", "#1c7ed6"];
  const DMI_N = 13;

  function chartOptions(extra) {
    return Object.assign({
      autoSize: true,
      layout: { background: { type: "solid", color: v("--card") }, textColor: v("--muted"), fontSize: 12 },
      grid: { vertLines: { color: v("--grid") }, horzLines: { color: v("--grid") } },
      rightPriceScale: { borderColor: v("--border"), minimumWidth: 72 },  // 各格右側同寬才對得齊
      localization: { locale: "zh-TW" },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    }, extra || {});
  }

  // 陣列 → lightweight-charts 資料；null 的位置放空白點，讓各格的 K 棒序號一致
  function series(dates, arr, digits) {
    return dates.map((t, i) => (arr[i] == null ? { time: t } : { time: t, value: +arr[i].toFixed(digits == null ? 2 : digits) }));
  }

  function line(chart, color, extra) {
    return chart.addLineSeries(Object.assign({
      color: color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    }, extra || {}));
  }

  // K 線下面三格：成交量（固定）＋副圖一、副圖二（本人可各選一個技術指標）
  const SUB_TYPES = [["dmi", "DMI"], ["kd", "KD"], ["rsi", "RSI"], ["macd", "MACD"], ["none", "不顯示"]];
  const DEFAULT_SUBS = ["vol", "dmi", "rsi"];
  // 讀設定：回傳 ["vol", 副圖一, 副圖二]（舊設定只有 opts.sub 一個：當副圖一）
  function subsOf(opts) {
    const ok = (x) => SUB_TYPES.some(([k]) => k === x);
    if (Array.isArray(opts.subs) && opts.subs.length === 3 && ok(opts.subs[1]) && ok(opts.subs[2])) return ["vol", opts.subs[1], opts.subs[2]];
    if (opts.sub && ok(opts.sub)) return ["vol", opts.sub, opts.sub === "rsi" ? "dmi" : "rsi"];
    return DEFAULT_SUBS.slice();
  }

  // hosts：{ price, subs: [副圖一, 副圖二, 副圖三] }，各自一張圖、時間軸同步，高度由頁面的拖拉條調整（initPanes）
  // d：{ market, price: {dates, open, high, low, close, volume}, volUnit }
  // opts：{ deduct, subs: ["vol"|"dmi"|"kd"|"rsi"|"macd"|"none" ×3], track }
  // 日 K 的 dates 是 "YYYY-MM-DD"；分鐘 K 是時間戳（秒，已換成交易所當地時間），要顯示時、分
  // 回傳的 update(newPrice) 用來盤中即時更新：只換資料，不重建圖，保留目前的縮放位置（看著最新一根時會跟著往右）
  function kline(hosts, d, opts) {
    let p = d.price, n = p.dates.length, volArr = [];
    const up = v("--up"), down = v("--down");
    const intraday = typeof p.dates[0] === "number";
    const s = maSettings();
    const maList = s.ma.filter((x) => x.on), volList = s.vol.filter((x) => x.on);
    const lot = d.market === "TW" ? 1000 : 1;  // 台股量換算成「張」
    const subs = subsOf(opts);
    hosts.subs.forEach((h, i) => { h.hidden = subs[i] === "none"; h.innerHTML = ""; });
    hosts.price.innerHTML = "";
    const lastShown = subs.reduce((a, t, i) => (t !== "none" ? i : a), -1);  // 最下面那一格才顯示時間軸
    const ts = (show) => ({ timeScale: { borderColor: v("--border"), visible: show, timeVisible: intraday, secondsVisible: false } });
    const values = {};  // 給圖例、小框用（update 時就地更新，頁面拿到的物件不變）

    // ---- 價 ----
    const chart = LightweightCharts.createChart(hosts.price, chartOptions(ts(lastShown < 0)));
    klines.push(chart);
    const candle = chart.addCandlestickSeries({
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.05 } });
    const maSeries = maList.map((m) => line(chart, m.color, { lineWidth: m.width }));

    // ---- 三個副圖 ----
    const panes = [];   // { chart, main, fill }
    let vol = null;     // 成交量那條（扣抵標記用）；沒選成交量副圖時是 null
    subs.forEach((type, idx) => {
      if (type === "none") return;
      const c = LightweightCharts.createChart(hosts.subs[idx], chartOptions(ts(idx === lastShown)));
      klines.push(c);
      const ref = (ser, lv, label) => ser.createPriceLine({ price: lv, color: v("--muted"), lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: !!label });
      let main, fillFn;
      if (type === "vol") {
        const h = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
        h.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0 } });
        const vma = volList.map((m) => line(c, m.color, { lineWidth: m.width }));
        if (!vol) vol = h;
        main = h;
        fillFn = () => {
          h.setData(p.dates.map((t, i) => ({ time: t, value: Math.round(volArr[i]), color: rgba(p.close[i] >= p.open[i] ? up : down, 0.55) })));
          volList.forEach((m, j) => vma[j].setData(series(p.dates, values["VMA" + m.n], 0)));
        };
      } else if (type === "dmi") {
        const a = line(c, up, { lineWidth: 2 }), b = line(c, down, { lineWidth: 2 }), adx = line(c, "#1c7ed6", { lineWidth: 2 });
        ref(adx, 25);
        main = adx;
        fillFn = () => {
          const r = Ind.dmi(p.high, p.low, p.close, DMI_N, DMI_N);
          a.setData(series(p.dates, r.plus)); b.setData(series(p.dates, r.minus)); adx.setData(series(p.dates, r.adx));
          values.PDI = r.plus; values.MDI = r.minus; values.ADX = r.adx;
        };
      } else if (type === "rsi") {
        const a = line(c, SUB_COLORS[0], { lineWidth: 2 }), b = line(c, SUB_COLORS[1], { lineWidth: 2 });
        ref(a, 70, true); ref(a, 50); ref(a, 30, true);
        main = a;
        fillFn = () => {
          const r6 = Ind.rsi(p.close, 6), r12 = Ind.rsi(p.close, 12);
          a.setData(series(p.dates, r6)); b.setData(series(p.dates, r12));
          values.RSI6 = r6; values.RSI12 = r12;
        };
      } else if (type === "kd") {
        const k = line(c, SUB_COLORS[0], { lineWidth: 2 }), dl = line(c, SUB_COLORS[1], { lineWidth: 2 });
        ref(k, 80); ref(k, 20);
        main = k;
        fillFn = () => {
          const r = Ind.kd(p.high, p.low, p.close, 9, 3, 3);
          k.setData(series(p.dates, r.K)); dl.setData(series(p.dates, r.D));
          values.K = r.K; values.D = r.D;
        };
      } else if (type === "macd") {
        const h = c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        const a = line(c, SUB_COLORS[0], { lineWidth: 2 }), b = line(c, SUB_COLORS[1], { lineWidth: 2 });
        main = a;
        fillFn = () => {
          const r = Ind.macd(p.close, 12, 26, 9);
          h.setData(p.dates.map((t, i) => (r.osc[i] == null ? { time: t } : { time: t, value: +r.osc[i].toFixed(3), color: rgba(r.osc[i] >= 0 ? up : down, 0.6) })));
          a.setData(series(p.dates, r.dif, 3)); b.setData(series(p.dates, r.sig, 3));
          values.DIF = r.dif; values.MACD = r.sig; values.OSC = r.osc;
        };
      }
      panes.push({ chart: c, main, fill: fillFn });
    });

    // 把 p 的資料填進所有線（第一次畫、盤中更新都用這個）
    function fill() {
      n = p.dates.length;
      candle.setData(p.dates.map((t, i) => ({ time: t, open: p.open[i], high: p.high[i], low: p.low[i], close: p.close[i] })));
      maList.forEach((m, j) => {
        values["MA" + m.n] = Ind.sma(p.close, m.n);
        maSeries[j].setData(series(p.dates, values["MA" + m.n]));
      });
      // 量和均量不管有沒有成交量副圖都算（圖例、扣抵表要用）
      volArr = p.volume.map((x) => x / lot);
      values.vol = volArr;
      ret.volArr = volArr;
      volList.forEach((m) => { values["VMA" + m.n] = Ind.sma(volArr, m.n); });
      panes.forEach((pn) => pn.fill());
    }

    // ---- 各格可視範圍互相同步（拖曳、縮放任一格都帶動其他格） ----
    const all = [chart].concat(panes.map((pn) => pn.chart));
    let syncing = false;
    const setRange = (range) => { syncing = true; all.forEach((c) => c.timeScale().setVisibleLogicalRange(range)); syncing = false; };
    all.forEach((a) => a.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      all.forEach((b) => { if (b !== a) b.timeScale().setVisibleLogicalRange(range); });
      syncing = false;
    }));

    // ---- 扣抵（動態）：以游標所在的 K 棒為「今天」，標出各均線、均量的扣抵 K 棒與扣抵價 ----
    let priceLines = [], deductAt = -1;
    function showDeduction(t) {
      if (!opts.deduct || t === deductAt) return;
      deductAt = t;
      priceLines.forEach((l) => candle.removePriceLine(l));
      priceLines = [];
      const markers = [];
      maList.forEach((m) => {
        const info = Ind.deduction(p.close, m.n, t);
        if (!info) return;
        markers.push({ time: p.dates[info.index], position: "aboveBar", color: m.color, shape: "arrowDown", text: m.n + "扣 " + App.fmtPrice(info.value) });
        priceLines.push(candle.createPriceLine({ price: info.value, color: m.color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: m.n + "扣" }));
      });
      markers.sort((a, b) => (a.time < b.time ? -1 : 1));
      candle.setMarkers(markers);
      if (!vol) return;
      const vmarkers = [];
      volList.forEach((m) => {
        const info = Ind.deduction(volArr, m.n, t);
        if (info) vmarkers.push({ time: p.dates[info.index], position: "aboveBar", color: m.color, shape: "arrowDown", text: "量" + m.n + "扣" });
      });
      vmarkers.sort((a, b) => (a.time < b.time ? -1 : 1));
      vol.setMarkers(vmarkers);
    }

    // ---- 游標：回報第幾根 K 棒；「查價」打勾時在主圖顯示資訊小框；各格十字線同步 ----
    // opts.track === false（「查價」沒打勾）：只有十字線，數值與扣抵固定在最新一根
    const listeners = [];
    const mainSeries = new Map([[chart, candle]]);
    panes.forEach((pn) => mainSeries.set(pn.chart, pn.main));
    let crossSync = false, hoverIdx = null, tipPoint = null;
    function report(src, param) {
      const onBar = param && param.logical != null && param.logical >= 0 && param.logical < n;
      hoverIdx = opts.track !== false && onBar ? Math.round(param.logical) : null;
      const i = hoverIdx != null ? hoverIdx : n - 1;
      showDeduction(i);
      listeners.forEach((fn) => fn(i));
      if (hoverIdx != null && src === chart && param.point) { tipPoint = param.point; showTip(hoverIdx, param.point); }
      else if (src === chart || hoverIdx == null) { tipPoint = null; tip.style.display = "none"; }
      // 其他格同步顯示同一根的垂直十字線（lightweight-charts 4.1 起有 setCrosshairPosition）
      if (crossSync || typeof chart.setCrosshairPosition !== "function") return;
      crossSync = true;
      all.forEach((c) => {
        if (c === src) return;
        const ser = mainSeries.get(c);
        if (onBar && param.time != null && ser) {
          const row = ser.dataByIndex ? ser.dataByIndex(Math.round(param.logical)) : null;
          const val = row && (row.value != null ? row.value : row.close);
          if (val != null) c.setCrosshairPosition(val, param.time, ser);
        } else c.clearCrosshairPosition();
      });
      crossSync = false;
    }
    all.forEach((c) => c.subscribeCrosshairMove((param) => report(c, param)));

    // 資訊小框：日期、開高低收、漲跌、量、各均線
    const tip = document.createElement("div");
    tip.className = "k-tip";
    tip.style.display = "none";
    hosts.price.appendChild(tip);
    const volUnit = d.volUnit != null ? d.volUnit : d.market === "TW" ? "張" : "";
    const f2 = (x) => (App.isNum(x) ? App.fmtNum(x, Math.abs(x) >= 1000 ? 0 : 2) : "—");
    function showTip(i, pt) {
      const chg = i > 0 ? (p.close[i] / p.close[i - 1] - 1) * 100 : null;
      const cls = App.upDown(chg);
      let html = '<div class="k-tip-d">' + timeLabel(p.dates[i]) + "</div>" +
        "<div>開 <b>" + f2(p.open[i]) + "</b></div><div>高 <b>" + f2(p.high[i]) + "</b></div><div>低 <b>" + f2(p.low[i]) + "</b></div>" +
        '<div>收 <b class="' + cls + '">' + f2(p.close[i]) + "</b> " + '<span class="' + cls + '">' + App.fmtPct(chg, true) + "</span></div>" +
        "<div>量 <b>" + App.fmtNum(volArr[i], 0) + "</b> " + volUnit + "</div>";
      maList.forEach((m) => { html += '<div style="color:' + m.color + '">MA' + m.n + " <b>" + f2(values["MA" + m.n][i]) + "</b></div>"; });
      tip.innerHTML = html;
      tip.style.display = "block";
      // 放在游標右下，靠近邊緣就換到左邊／上面
      const W = hosts.price.clientWidth, H = hosts.price.clientHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = pt.x + 16, y = pt.y + 16;
      if (x + tw > W - 80) x = pt.x - tw - 16;   // 右邊留給價格座標
      if (y + th > H) y = Math.max(0, pt.y - th - 16);
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = y + "px";
    }

    // 圖例：副圖指標的數值（成交量由頁面自己顯示）
    function indLegend(i) {
      const vf = (x, dg) => (App.isNum(x) ? App.fmtNum(x, dg == null ? 2 : dg) : "—");
      const C = SUB_COLORS;
      let html = "";
      subs.forEach((t) => {
        if (t === "dmi") html += '<span class="up">+DI' + DMI_N + " " + vf(values.PDI[i]) + '</span><span class="down">−DI ' + vf(values.MDI[i]) + '</span><span style="color:#1c7ed6">ADX ' + vf(values.ADX[i]) + "</span>";
        if (t === "kd") html += '<span style="color:' + C[0] + '">K ' + vf(values.K[i]) + '</span><span style="color:' + C[1] + '">D ' + vf(values.D[i]) + "</span>";
        if (t === "rsi") html += '<span style="color:' + C[0] + '">RSI6 ' + vf(values.RSI6[i]) + '</span><span style="color:' + C[1] + '">RSI12 ' + vf(values.RSI12[i]) + "</span>";
        if (t === "macd") html += '<span style="color:' + C[0] + '">DIF ' + vf(values.DIF[i], 3) + '</span><span style="color:' + C[1] + '">MACD ' + vf(values.MACD[i], 3) + '</span><span class="' + App.upDown(values.OSC[i]) + '">OSC ' + vf(values.OSC[i], 3) + "</span>";
      });
      return html;
    }

    // 盤中即時更新：換成新的資料（同一組 K 棒再加上最新幾根）
    function update(np) {
      if (!np || !np.dates.length) return;
      const oldN = n, r = chart.timeScale().getVisibleLogicalRange();
      p = np;
      fill();
      // 原本看著最新一根：跟著新 K 棒往右移；在看舊資料：位置不動
      if (r) {
        const shift = r.to >= oldN - 1.5 ? n - oldN : 0;
        setRange({ from: r.from + shift, to: r.to + shift });
      }
      deductAt = -1;
      const i = hoverIdx != null && hoverIdx < n ? hoverIdx : n - 1;
      showDeduction(i);
      listeners.forEach((fn) => fn(i));
      if (hoverIdx != null && tipPoint) showTip(hoverIdx, tipPoint);
    }

    const ret = { values, volArr, ma: maList, volMa: volList, subs, indLegend, update, onCrosshair: (fn) => { listeners.push(fn); fn(n - 1); } };
    fill();
    setRange({ from: n - 130, to: n + 2 });  // 預設看近半年
    showDeduction(n - 1);
    return ret;
  }

  // 副圖一、副圖二的下拉選單（頁面放進工具列；select 的 data-subi 是 subs 的位置 1、2）
  function subSelectsHtml(subs) {
    return '<span class="sub-sel">' + ["副圖一", "副圖二"].map((name, j) =>
      "<label>" + name + ' <select data-subi="' + (j + 1) + '" aria-label="' + name + '指標">' +
        SUB_TYPES.map(([k, t]) => '<option value="' + k + '"' + (subs[j + 1] === k ? " selected" : "") + ">" + t + "</option>").join("") +
      "</select></label>").join("") + "</span>";
  }

  // ---------- 價／量／副圖三格的高度：格與格之間的拖拉條，高度記在瀏覽器 ----------
  // panes：[{ el, key, def, min }]，每格下方加一條拖拉條，往下拉變高、往上拉變矮
  function initPanes(storeKey, panes) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch (e) {}
    panes.forEach((pn) => {
      pn.el.classList.add("kpane");
      pn.el.style.height = (saved[pn.key] || pn.def) + "px";
      if (pn.el.nextElementSibling && pn.el.nextElementSibling.classList.contains("pane-resizer")) return;
      const bar = document.createElement("div");
      bar.className = "pane-resizer";
      bar.setAttribute("role", "separator");
      bar.setAttribute("aria-orientation", "horizontal");
      bar.setAttribute("aria-label", "拖拉調整高度");
      bar.tabIndex = 0;
      bar.title = "上下拖拉調整高度（也可用方向鍵）";
      pn.el.after(bar);
      const set = (h) => {
        h = Math.max(pn.min || 60, Math.min(1200, Math.round(h)));
        pn.el.style.height = h + "px";
        saved[pn.key] = h;
        try { localStorage.setItem(storeKey, JSON.stringify(saved)); } catch (e) {}
      };
      bar.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const y0 = e.clientY, h0 = pn.el.getBoundingClientRect().height;
        bar.setPointerCapture(e.pointerId);
        bar.classList.add("dragging");
        const move = (ev) => set(h0 + ev.clientY - y0);
        const upFn = () => { bar.classList.remove("dragging"); bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", upFn); };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", upFn);
      });
      bar.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          set(pn.el.getBoundingClientRect().height + (e.key === "ArrowDown" ? 20 : -20));
        }
      });
    });
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
    aggregate, timeLabel, destroyKlines, kline, revenue, quarterly, eps, destroyAll, quarterLabel,
    maSettings, saveMaSettings, DEFAULT_MA, initPanes, SUB_COLORS, DMI_N, SUB_TYPES, subsOf, subSelectsHtml };
})();
