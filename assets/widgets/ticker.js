// 區塊：指數跑馬燈（加權、櫃買、台指期：data/market.json；台積電 ADR、美元／台幣、S&P 500、Nasdaq、費半、VIX：api/quotes 延遲報價）
// 參數：market "tw"|"us"|"both"（決定順序，內容都放）
(function () {
  const isNum = (x) => App.isNum(x);
  const item = (name, val, chg, pct, note) => '<span class="tk-i"><b>' + name + "</b> " + val +
    ' <span class="' + App.upDown(chg) + '">' + (isNum(chg) ? (chg > 0 ? "+" : chg < 0 ? "−" : "") + App.fmtNum(Math.abs(chg), 2) + "（" + App.fmtPct(pct, true) + "）" : "—") + "</span>" +
    (note ? ' <i class="updated">' + note + "</i>" : "") + "</span>";

  Widgets.register("ticker", (el, o) => {
    el.classList.add("w-ticker");
    el.innerHTML = '<div class="tk-track"><span class="updated">讀取中…</span></div>';
    async function draw(market) {
      const tw = [], us = [];
      try {
        const m = await Data.market();
        for (const [k, name] of [["taiex", "加權"], ["otc", "櫃買"], ["tx", "台指期"]]) {
          const s = m[k], n = s ? s.close.length : 0;
          if (n < 2) { tw.push(item(name, "—", null, null, "沒有資料")); continue; }
          const c = s.close[n - 1], p = s.close[n - 2];
          tw.push(item(name, App.fmtNum(c, k === "tx" ? 0 : 2), c - p, (c / p - 1) * 100, s.dates[n - 1].slice(5)));
        }
      } catch (e) { tw.push(item("台股大盤", "—", null, null, "讀不到 market.json")); }
      try {
        const q = (await Data.json("api/quotes?set=us")).quotes;
        const by = Object.fromEntries(q.map((x) => [x.key, x]));
        const one = (k, name, dg) => { const x = by[k]; return x && isNum(x.price) ? item(name, App.fmtNum(x.price, dg), x.change, x.change_pct) : item(name, "—", null, null, "暫時抓不到"); };
        tw.push(one("TSM", "台積電 ADR", 2), one("TWD", "美元／台幣", 3));
        us.push(one("GSPC", "S&P 500", 2), one("IXIC", "Nasdaq", 2), one("SOX", "費半", 2), one("VIX", "VIX", 2));
      } catch (e) { us.push(item("美股", "—", null, null, "即時行情暫時抓不到")); }
      el.querySelector(".tk-track").innerHTML = (market === "us" ? us.concat(tw) : tw.concat(us)).join("");
    }
    let cur = o.market || "tw";
    draw(cur);
    return { update(n) { if (n.market && n.market !== cur) { cur = n.market; draw(cur); } } };
  });
})();
