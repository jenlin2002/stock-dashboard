// 區塊：K 線（個股或指數），和個股頁、大盤頁同一套：
//   週期 1／5／15／30／60 分、日、週、月；均線＋扣抵（動態）、成交量＋副圖一、二（⚙ 設定）、查價、可拖拉高度、全螢幕、扣抵表；
//   台股盤中即時（富果，有設定金鑰時）。
// 參數：market "tw"|"us"|"idx"、symbol（個股代號，或指數 TWII／OTC／TX／DJI／IXIC／GSPC／SOX／RUT）、title（false＝不顯示）、
//       deduct（false＝不顯示扣抵表）、height（K 線高度 px）
// 回傳 { update({market, symbol}) } 換股票。
(function () {
  const TFS = [["1", "1分"], ["5", "5分"], ["15", "15分"], ["30", "30分"], ["60", "60分"], ["D", "日"], ["W", "週"], ["M", "月"]];
  const IDX = {
    TWII: { name: "加權指數", unit: "億", day: "taiex", fugle: "IX0001", minute: true },
    OTC: { name: "櫃買指數", unit: "億", day: "otc", fugle: "IX0043", minute: false },
    TX: { name: "台指期（主力）", unit: "口", day: "tx", minute: false },
    DJI: { name: "道瓊工業", unit: "股", minute: true }, IXIC: { name: "那斯達克", unit: "股", minute: true },
    GSPC: { name: "標普 500", unit: "股", minute: true }, SOX: { name: "費城半導體", unit: "股", minute: true },
    RUT: { name: "羅素 2000", unit: "股", minute: true },
  };
  const toYi = (s) => Object.assign({}, s, { volume: s.volume.map((v) => (App.isNum(v) ? Math.round(v / 1e8) : 0)) });
  let uid = 0;

  function loadOpts() {
    let o = { deduct: true };
    try { o = Object.assign(o, JSON.parse(localStorage.getItem("kline-opts-v2") || "{}")); } catch (e) {}
    delete o.ma;
    o.subs = Charts.subsOf(o);
    delete o.sub;
    if (!TFS.some(([k]) => k === o.tf)) o.tf = "D";
    return o;
  }
  function saveOpts(o) {
    try {
      const old = JSON.parse(localStorage.getItem("kline-opts-v2") || "{}");
      delete old.sub;
      localStorage.setItem("kline-opts-v2", JSON.stringify(Object.assign(old, { deduct: o.deduct, track: o.track, tf: o.tf, subs: o.subs })));
    } catch (e) {}
  }

  Widgets.register("kline", (el, o) => {
    const id = "wk" + (++uid);
    const opts = loadOpts();
    let cur = { market: o.market || "tw", symbol: String(o.symbol || (o.market === "idx" ? "TWII" : "")).toUpperCase() };
    el.classList.add("w-kline", "panel");
    el.innerHTML =
      (o.title === false ? "" : '<h3 class="w-ktitle"></h3>') +
      '<div class="tf-tabs"><span class="seg" data-c="tf" role="tablist" aria-label="K 線週期"></span> <span data-c="live"></span></div>' +
      '<div class="kctl" data-c="ctl"></div>' +
      '<div class="klegend" data-c="legend"></div>' +
      '<div class="body chart-body" id="' + id + '-p"></div>' +
      '<div class="body sub-body" id="' + id + '-s1"></div><div class="body sub-body" id="' + id + '-s2"></div><div class="body sub-body" id="' + id + '-s3"></div>' +
      (o.deduct === false ? "" : '<details class="k-box" data-c="dbox" open hidden><summary>扣抵表</summary><div class="table-wrap" data-c="deduct"></div></details>');
    const q = (c) => el.querySelector('[data-c="' + c + '"]');
    const hostP = el.querySelector("#" + id + "-p"), subs = [1, 2, 3].map((i) => el.querySelector("#" + id + "-s" + i));
    Charts.initPanes("pane-h-widget", [
      { el: hostP, key: "price", def: +o.height || 380, min: 150 },
      { el: subs[0], key: "sub1", def: 110, min: 50 },
      { el: subs[1], key: "sub2", def: 110, min: 50 },
      { el: subs[2], key: "sub3", def: 110, min: 50 },
    ]);
    Charts.fullscreenButton(el);

    // ---------- 資料 ----------
    let base = null;         // { kind: "stock"|"idx", item, d（個股資料）, idx, daily（日線，指數已換算單位）, market（Charts 用）, volUnit }
    const cache = {};        // 週期 → 歷史資料（Promise）
    const minuteToday = {};  // 週期 → 富果今天的分鐘 K
    let liveQ = null;
    async function loadBase() {
      if (cur.market === "idx") {
        const idx = IDX[cur.symbol] || IDX.TWII;
        let daily;
        if (idx.day) {
          const m = await Data.market();
          if (!m[idx.day]) throw new Error("data/market.json 沒有 " + idx.name);
          daily = idx.unit === "億" ? toYi(m[idx.day]) : m[idx.day];
        } else {
          daily = (await App.loadJSON("api/intraday?market=idx&symbol=" + cur.symbol + "&tf=D")).price;
        }
        return { kind: "idx", idx, sym: cur.symbol, raw: daily, market: "IDX", volUnit: idx.unit, name: idx.name };
      }
      const item = await Data.item(cur.market, cur.symbol);
      const d = await Data.stock(item);
      return { kind: "stock", item, d, raw: d.price, market: d.market, volUnit: d.market === "TW" ? "張" : "", name: (d.name || item.name) + "（" + App.symbolOf(item) + "）" };
    }
    // 日線（加上富果今天這根）
    function daily() {
      if (!liveQ || !base) return base.raw;
      if (base.kind === "stock") return Live.mergeDaily(base.raw, liveQ, 1000);
      // 指數：market.json 是元，換算前合併再轉億
      return base.idx.unit === "億" ? toYi(Live.mergeDaily(Object.assign({}, base.raw, { volume: base.raw.volume.map((v) => v * 1e8) }), liveQ, 1)) : base.raw;
    }
    async function series(tf) {
      if (tf === "D") return daily();
      if (tf === "W" || tf === "M") return Charts.aggregate(daily(), tf);
      if (!cache[tf]) {
        cache[tf] = (base.kind === "idx"
          ? (base.idx.minute ? App.loadJSON("api/intraday?market=idx&symbol=" + base.sym + "&tf=" + tf).then((x) => x.price) : Promise.resolve(null))
          : App.loadIntraday(base.item, tf).then((x) => x.price)).catch((e) => { delete cache[tf]; throw e; });
      }
      let hist = await cache[tf];
      const today = minuteToday[tf];
      if (today) {
        const t = base.kind === "idx" ? { price: Object.assign({}, today.price, { volume: today.price.volume.map((x) => Math.round(x / 1e8)) }) } : today;
        hist = Live.mergeMinute(hist, t);
      }
      if (!hist || !hist.dates.length) throw new Error(base.kind === "idx" ? base.idx.name + "沒有免費的分鐘資料" : "沒有分鐘資料");
      return hist;
    }
    const fugleSym = () => (!base ? null : base.kind === "stock" ? (base.d.market === "TW" ? App.symbolOf(base.item) : null) : base.idx.fugle || null);

    // ---------- 控制列 ----------
    function renderControls() {
      q("tf").innerHTML = TFS.map(([k, t]) => {
        const off = base && base.kind === "idx" && !base.idx.minute && !"DWM".includes(k) && !fugleSym();
        return '<button type="button" role="tab" data-tf="' + k + '" aria-pressed="' + (opts.tf === k) + '" aria-selected="' + (opts.tf === k) + '"' + (off ? " disabled" : "") + ">" + t + "</button>";
      }).join("");
      q("ctl").innerHTML =
        Charts.maSettings().ma.map((m, i) => '<label><input type="checkbox" data-ma="' + i + '"' + (m.on ? " checked" : "") + '><i style="background:' + m.color + '"></i>MA' + m.n + "</label>").join("") +
        '<button type="button" class="btn ma-btn" data-act="cfg" title="副圖一、副圖二的技術指標，均線、均量線的天數、顏色、粗細">⚙ 設定</button>' +
        '<label><input type="checkbox" data-deduct' + (opts.deduct ? " checked" : "") + ">扣抵</label>" +
        '<label class="track" title="打勾：游標移到哪根 K 棒，上方數值、扣抵就換成那一根；不打勾：游標只顯示十字線"><input type="checkbox" data-track' + (opts.track !== false ? " checked" : "") + ">查價</label>";
    }
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !el.contains(b)) return;
      if (b.dataset.tf && !b.disabled && b.dataset.tf !== opts.tf) {
        opts.tf = b.dataset.tf; saveOpts(opts); draw();
        if (liveCtl && !"DWM".includes(opts.tf)) liveCtl.now();
      } else if (b.dataset.act === "cfg") {
        MaConfig.open(opts.subs, (s) => { opts.subs = s; saveOpts(opts); renderControls(); draw(); });
      }
    });
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (!q("ctl").contains(t)) return;
      if (t.dataset.ma != null) { const s = Charts.maSettings(); if (s.ma[+t.dataset.ma]) s.ma[+t.dataset.ma].on = t.checked; Charts.saveMaSettings(s); }
      if ("deduct" in t.dataset) opts.deduct = t.checked;
      if ("track" in t.dataset) opts.track = t.checked;
      saveOpts(opts);
      draw();
    });

    // ---------- 畫圖 ----------
    let k = null, kp = null, seq = 0, deductAt = -1;
    async function draw() {
      const my = ++seq, lg = q("legend");
      if (k) { k.destroy(); k = null; }
      if (!base) return;
      const tfName = TFS.find(([x]) => x === opts.tf)[1];
      const h3 = el.querySelector(".w-ktitle");
      if (h3) h3.textContent = base.name + " K 線（" + tfName + "）";
      renderControls();
      let p;
      try {
        if (!"DWM".includes(opts.tf)) lg.innerHTML = "<span>讀取 " + tfName + "線…</span>";
        p = await series(opts.tf);
      } catch (err) { if (my === seq) lg.innerHTML = '<span class="down">— ' + App.esc(err.message) + "</span>"; return; }
      if (my !== seq || !p || !p.dates.length) return;
      kp = p; deductAt = -1;
      k = Charts.kline({ price: hostP, subs }, { market: base.market, price: p, volUnit: base.volUnit }, opts);
      const vf = (x, dg) => (App.isNum(x) ? App.fmtNum(x, dg == null ? 2 : dg) : "—");
      const fp = base.kind === "idx" ? (x) => vf(x) : App.fmtPrice;
      k.onCrosshair((i) => {
        const p = kp;
        const chg = i > 0 ? (p.close[i] / p.close[i - 1] - 1) * 100 : null;
        let html = "<span>" + Charts.timeLabel(p.dates[i]) + "</span><span>開 " + fp(p.open[i]) + " 高 " + fp(p.high[i]) + " 低 " + fp(p.low[i]) +
          ' 收 <b class="' + App.upDown(chg) + '">' + fp(p.close[i]) + " " + App.fmtPct(chg, true) + "</b></span>";
        html += k.ma.map((m) => '<span style="color:' + m.color + '">MA' + m.n + " " + vf(k.values["MA" + m.n][i]) + "</span>").join("");
        if (k.values.vol[i]) {
          html += "<span>量 " + vf(k.values.vol[i], 0) + " " + base.volUnit + "</span>";
          html += k.volMa.map((m) => '<span style="color:' + m.color + '">均量' + m.n + " " + vf(k.values["VMA" + m.n][i], 0) + "</span>").join("");
        }
        html += k.indLegend(i);
        lg.innerHTML = html;
        renderDeduct(i);
      });
    }
    function renderDeduct(t) {
      const box = q("dbox");
      if (!box) return;
      if (!opts.deduct || !k) { box.hidden = true; return; }
      if (t === deductAt) return;
      deductAt = t;
      const html = DeductTable.html({ dates: kp.dates, close: kp.close, volume: kp.volume }, t,
        { ma: k.ma, volMa: k.volMa, lot: base.market === "TW" ? 1000 : 1, tfName: TFS.find(([x]) => x === opts.tf)[1] });
      box.hidden = !html;
      q("deduct").innerHTML = html;
    }
    async function refresh() {
      if (!k || !base) return;
      const my = seq, p = await series(opts.tf).catch(() => null);
      if (!p || my !== seq || !k) return;
      kp = p; deductAt = -1;
      k.update(p);
    }

    // ---------- 台股盤中即時（富果） ----------
    let liveCtl = null;
    function startLive() {
      if (liveCtl) { liveCtl.stop(); liveCtl = null; }
      q("live").innerHTML = "";
      const sym = fugleSym();
      if (!sym) return;
      liveCtl = Live.start(async () => {
        const tf = opts.tf, minute = !"DWM".includes(tf);
        const r = await Live.fetchRt([sym], minute ? sym : null, tf);
        const qq = r.quotes[sym];
        if (!qq) throw new Error((r.errors && r.errors[sym]) || "富果沒有即時資料");
        liveQ = qq;
        if (minute && r.candles) minuteToday[tf] = r.candles;
        await refresh();
        return qq.date === Live.twNow().date;
      }, base.kind === "idx" ? 10000 : 5000, (s) => { q("live").innerHTML = Live.badge(s); });
    }

    async function load() {
      const my = ++seq;
      base = null; liveQ = null;
      for (const key of Object.keys(cache)) delete cache[key];
      for (const key of Object.keys(minuteToday)) delete minuteToday[key];
      if (k) { k.destroy(); k = null; }
      if (!cur.symbol) { q("legend").innerHTML = '<span class="updated">— 沒有指定股票</span>'; return; }
      q("legend").innerHTML = "<span>讀取中…</span>";
      try { base = await loadBase(); } catch (e) { if (my === seq) q("legend").innerHTML = '<span class="down">— 讀不到資料（' + App.esc(e.message) + "）</span>"; return; }
      if (my !== seq) return;
      if (base.kind === "idx" && !base.idx.minute && !fugleSym() && !"DWM".includes(opts.tf)) opts.tf = "D";
      draw();
      startLive();
    }
    const onTheme = () => draw();
    App.onThemeChange(onTheme);
    load();
    return {
      update(n) {
        const m = n.market || cur.market, s = String(n.symbol || "").toUpperCase();
        if (!s || (m === cur.market && s === cur.symbol)) return;
        if (cur.market === "idx" && !n.forceSymbol) return;  // 指數 K 線不跟著換股票
        cur = { market: m, symbol: s };
        load();
      },
      destroy() { if (liveCtl) liveCtl.stop(); if (k) k.destroy(); document.removeEventListener("themechange", onTheme); },
    };
  });
})();
