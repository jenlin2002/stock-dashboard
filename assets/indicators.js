// 技術指標計算（純函式，輸入陣列、輸出與輸入等長的陣列，算不出來的位置為 null）
(function () {
  function sma(arr, n) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= n) sum -= arr[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ema(arr, n) {
    const out = new Array(arr.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null) continue;
      prev = prev == null ? arr[i] : arr[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  // KD（台灣常用的隨機指標）：RSV = (收盤 − n 日最低) / (n 日最高 − n 日最低) × 100
  // K = 前K × (1 − 1/kn) + RSV / kn；D = 前D × (1 − 1/dn) + K / dn；起始值 50
  function kd(high, low, close, n, kn, dn) {
    n = n || 9; kn = kn || 3; dn = dn || 3;
    const K = new Array(close.length).fill(null), D = new Array(close.length).fill(null);
    let k = 50, d = 50;
    for (let i = n - 1; i < close.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, high[j]); lo = Math.min(lo, low[j]); }
      const rsv = hi === lo ? 50 : (close[i] - lo) / (hi - lo) * 100;
      k = k * (1 - 1 / kn) + rsv / kn;
      d = d * (1 - 1 / dn) + k / dn;
      K[i] = k; D[i] = d;
    }
    return { K, D };
  }

  // MACD：DIF = EMA(快) − EMA(慢)；MACD（訊號線）= DIF 的 EMA；柱狀 OSC = DIF − MACD
  function macd(close, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    const f = ema(close, fast), s = ema(close, slow);
    const dif = close.map((_, i) => (i >= slow - 1 ? f[i] - s[i] : null));
    const sig = ema(dif, signal);
    const osc = dif.map((x, i) => (x == null || sig[i] == null ? null : x - sig[i]));
    return { dif, sig, osc };
  }

  // Wilder 平滑（RMA）：前 n 筆用簡單平均起頭，之後 (前值 × (n−1) + 本筆) / n
  function rma(arr, n) {
    const out = new Array(arr.length).fill(null);
    let prev = null, sum = 0, cnt = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null) continue;
      if (prev == null) {
        sum += arr[i];
        if (++cnt === n) { prev = sum / n; out[i] = prev; }
      } else {
        prev = (prev * (n - 1) + arr[i]) / n;
        out[i] = prev;
      }
    }
    return out;
  }

  // DMI（Wilder）：+DI、−DI 用 n 期，ADX 是 DX 再用 m 期平滑
  function dmi(high, low, close, n, m) {
    n = n || 14; m = m || n;
    const len = close.length, tr = [null], pdm = [null], mdm = [null];
    for (let i = 1; i < len; i++) {
      const upMove = high[i] - high[i - 1], downMove = low[i - 1] - low[i];
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
      pdm.push(upMove > downMove && upMove > 0 ? upMove : 0);
      mdm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const atr = rma(tr, n), sp = rma(pdm, n), sm = rma(mdm, n);
    const plus = atr.map((a, i) => (a ? sp[i] / a * 100 : null));
    const minus = atr.map((a, i) => (a ? sm[i] / a * 100 : null));
    const dx = plus.map((p, i) => (p == null || minus[i] == null || p + minus[i] === 0 ? null : Math.abs(p - minus[i]) / (p + minus[i]) * 100));
    return { plus, minus, adx: rma(dx, m) };
  }

  // 均線扣抵：今天的 n 日均線包含第 t−n+1 ～ t 根；明天會「扣掉」第 t−n+1 根（扣抵值）。
  // 明天收盤 > 扣抵值，均線上揚；< 扣抵值，均線下彎。
  // 未來 5 天的扣抵值若多數低於現價（扣低），均線較容易維持上揚。
  // t：以第幾根 K 棒為「今天」（預設最後一根），扣抵標記隨游標移動時用
  function deduction(close, n, t) {
    if (t == null) t = close.length - 1;
    if (t - n + 1 < 0) return null;
    const idx = t - n + 1;
    const price = close[t];
    const next5 = close.slice(idx, Math.min(idx + 5, t + 1));
    const below = next5.filter((x) => x < price).length;
    const avg = close.slice(idx, t + 1).reduce((a, b) => a + b, 0) / n;
    return {
      n: n,
      ma: avg,
      index: idx,                      // 扣抵 K 棒位置
      value: close[idx],               // 明天的扣抵值
      dir: price > close[idx] ? 1 : price < close[idx] ? -1 : 0,  // 以今天收盤估明天均線方向
      gapPct: (close[idx] / price - 1) * 100,                     // 明天收盤要漲跌多少才會讓均線轉向
      next5: next5,
      trend: below >= 4 ? "扣低" : below <= 1 ? "扣高" : "持平",   // 未來 5 天扣抵相對現價
    };
  }

  window.Ind = { sma, ema, rma, kd, macd, dmi, deduction };
})();
