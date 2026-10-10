// 台股盤中即時：呼叫 functions/api/rt.js（富果行情），開盤時間自動定時更新，收盤後停止。
// 富果免費方案日內行情每分鐘 60 次，同時開好幾頁會共用額度：被擋（429）就自動放慢。
(function () {
  // 台灣時間（不管電腦設在哪個時區）
  function twNow() {
    const d = new Date(Date.now() + 8 * 3600e3);
    return { date: d.toISOString().slice(0, 10), wd: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
  // 盤中（含 8:30 試撮、13:30 收盤後幾分鐘）：週一到週五 08:30～13:40
  function isSession() {
    const t = twNow();
    return t.wd >= 1 && t.wd <= 5 && t.min >= 8 * 60 + 30 && t.min <= 13 * 60 + 40;
  }

  async function fetchRt(symbols, candleSym, tf) {
    const q = new URLSearchParams({ symbols: symbols.join(",") });
    if (candleSym) { q.set("candles", candleSym); q.set("tf", String(tf)); }
    const res = await fetch("api/rt?" + q, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || "即時資料讀取失敗（" + res.status + "）"); e.code = body.code || res.status; throw e; }
    return body;
  }

  // 定時執行 task()。開盤時間每 ms 毫秒一次；不在盤中只跑一次（拿今天收盤的最後資料）。
  // 分頁切到背景時暫停，切回來立刻更新。task 回傳 false 表示不用再更新（例如今天沒開盤）。
  // onState(s)：s = { live, error, at }，給頁面顯示「即時」標籤
  function start(task, ms, onState) {
    let timer = null, stopped = false, wait = ms;
    const st = (x) => { if (onState) onState(x); };
    async function tick() {
      timer = null;
      if (stopped) return;
      let more = isSession();
      try {
        const r = await task();
        if (r === false) more = false;
        wait = ms;
        st({ live: more, at: new Date() });
      } catch (e) {
        if (e.code === "nokey") { st({ live: false, error: "nokey" }); return; }  // 還沒設定金鑰：不再試
        if (e.code === "limit" || e.code === 429) wait = Math.min(wait * 2, 60000);
        st({ live: more, error: e.message, at: new Date() });
      }
      if (more && !stopped && !document.hidden) timer = setTimeout(tick, wait);
    }
    const onVis = () => { if (!document.hidden && !timer && !stopped && isSession()) tick(); };
    document.addEventListener("visibilitychange", onVis);
    tick();
    return {
      stop() { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); },
      now() { if (!stopped) { clearTimeout(timer); tick(); } },
    };
  }

  // 日線加上今天這一根（今天的資料還沒進排程檔時新增，已有就換掉）。volMul：報價的量要乘多少才跟日線同單位
  function mergeDaily(price, q, volMul) {
    if (!price || !price.dates.length || !q || q.open == null || q.price == null || !q.date) return price;
    const n = price.dates.length, last = price.dates[n - 1];
    if (q.date < last) return price;
    const keep = q.date === last ? n - 1 : n;
    const cut = (a) => a.slice(0, keep);
    const vol = q.index ? q.value : q.vol;
    return {
      dates: cut(price.dates).concat([q.date]), open: cut(price.open).concat([q.open]),
      high: cut(price.high).concat([q.high]), low: cut(price.low).concat([q.low]), close: cut(price.close).concat([q.price]),
      volume: cut(price.volume).concat([(vol || 0) * (volMul == null ? 1 : volMul)]),
    };
  }

  // 分鐘線：歷史（Yahoo）的今天部分換成富果的今天 K 棒
  function mergeMinute(hist, today) {
    if (!today || !today.price || !today.price.dates.length) return hist;
    const t0 = Math.floor(today.price.dates[0] / 86400) * 86400;  // 今天 00:00（台灣時間）
    if (!hist || !hist.dates.length) return today.price;
    let k = hist.dates.length;
    while (k > 0 && hist.dates[k - 1] >= t0) k--;
    const out = {};
    ["dates", "open", "high", "low", "close", "volume"].forEach((f) => { out[f] = hist[f].slice(0, k).concat(today.price[f]); });
    return out;
  }

  function timeStr(d) { return d ? d.toLocaleTimeString("zh-TW", { hour12: false }) : ""; }

  // 「即時」小標籤的 HTML
  function badge(s) {
    if (!s) return "";
    if (s.error === "nokey") return '<span class="live-badge off" title="Cloudflare 尚未設定 FUGLE_API_KEY">未接即時</span>';
    if (s.error) return '<span class="live-badge err" title="' + App.esc(s.error) + '">即時暫停・' + timeStr(s.at) + "</span>";
    return s.live ? '<span class="live-badge on"><i></i>即時 ' + timeStr(s.at) + "</span>"
      : '<span class="live-badge" title="不在交易時間，顯示最後一筆">已收盤・富果</span>';
  }

  window.Live = { twNow, isSession, fetchRt, start, mergeDaily, mergeMinute, badge };
})();
