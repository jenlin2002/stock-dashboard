// 區塊：PEG 評分卡（REFS 式，m＝全市場、s＝同產業五分位圓點）。沿用 assets/refs.js（個股頁同一張）。
// 參數：market、symbol。只有台股有（全台股總表的資料）。
(function () {
  Widgets.register("pegCard", (el, o) => {
    el.classList.add("w-peg");
    let cur = null;
    function draw(market, symbol) {
      cur = { market, symbol };
      if (!symbol) { el.innerHTML = '<p class="note">— 沒有指定股票</p>'; return; }
      if (market === "us" || !/^\d/.test(symbol)) { el.innerHTML = '<p class="note">— PEG 評分卡目前只有台股（美股選股資料待補）</p>'; return; }
      el.innerHTML = "<div></div>" + (o.help === false ? "" :
        '<p class="note">圓點：<span class="refs-dot" style="--f:100%"></span>最強 20%　<span class="refs-dot" style="--f:50%"></span>中段　<span class="refs-dot"></span>最弱 20%；m＝全市場、s＝同產業。</p>');
      Refs.render(el.firstChild, String(symbol).toUpperCase());
    }
    draw(o.market, o.symbol);
    return { update(n) { if (n.symbol && (!cur || n.symbol !== cur.symbol)) draw(n.market, n.symbol); } };
  });
})();
