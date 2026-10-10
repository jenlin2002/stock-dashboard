// 區塊：三大法人籌碼（現貨買賣超，億元）：最新一天＋近 5 日累計的長條，下面是近 10 日外資。資料 data/market.json（和大盤頁同一份）。
(function () {
  const isNum = (x) => App.isNum(x), yi = (x) => x / 1e8;
  const bars = (rows) => {
    const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));
    return rows.map(([name, v]) => '<div class="cb-row"><span class="cb-name">' + name + '</span><span class="cb-track"><i class="' + (v >= 0 ? "up-bg" : "down-bg") + '" style="width:' + (Math.abs(v) / max * 50).toFixed(1) + "%;" + (v >= 0 ? "left:50%" : "right:50%") + '"></i></span><b class="' + App.upDown(v) + '">' + (v > 0 ? "+" : v < 0 ? "−" : "") + App.fmtNum(Math.abs(v), 1) + "</b></div>").join("");
  };
  Widgets.register("chips", (el, o) => {
    el.classList.add("w-chips");
    (async () => {
      let m;
      try { m = await Data.market(); } catch (e) { el.innerHTML = '<p class="note">— 讀不到 data/market.json</p>'; return; }
      const inst = (m.inst || []).filter((r) => isNum(r.foreign));
      if (!inst.length) { el.innerHTML = '<p class="note">— 沒有法人資料</p>'; return; }
      const last = inst[inst.length - 1], five = inst.slice(-5);
      const sum = (k) => five.reduce((a, r) => a + r[k], 0);
      const ten = inst.slice(-10);
      el.innerHTML = (o.title === false ? "" : '<div class="w-head"><h3>三大法人籌碼</h3><span class="updated">' + last.date + "（億元）</span></div>") +
        '<div class="cb"><div class="cb-cap">' + last.date.slice(5) + " 當日</div>" + bars([["外資", yi(last.foreign)], ["投信", yi(last.trust)], ["自營商", yi(last.dealer)], ["合計", yi(last.foreign + last.trust + last.dealer)]]) +
        '<div class="cb-cap">近 5 日累計</div>' + bars([["外資", yi(sum("foreign"))], ["投信", yi(sum("trust"))], ["自營商", yi(sum("dealer"))]]) +
        '<div class="cb-cap">外資近 10 日</div>' + bars(ten.map((r) => [r.date.slice(5), yi(r.foreign)])) + "</div>";
    })();
  });
})();
