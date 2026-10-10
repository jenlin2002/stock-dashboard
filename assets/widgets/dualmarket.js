// 區塊：雙市場列（C 版中欄頂部）：台股一列（加權、櫃買、成交金額、漲跌家數）、美股一列（S&P 500、Nasdaq、費半、VIX，延遲報價）。
(function () {
  const isNum = (x) => App.isNum(x);
  const cell = (name, val, pct) => '<span class="dm-c"><span>' + name + "</span><b>" + val + '</b><i class="' + App.upDown(pct) + '">' + App.fmtPct(pct, true) + "</i></span>";
  Widgets.register("dualMarket", (el) => {
    el.classList.add("w-dual");
    el.innerHTML = '<div class="dm-row"><b class="dm-mk">台股</b><span class="updated">讀取中…</span></div><div class="dm-row"><b class="dm-mk">美股</b><span class="updated">讀取中…</span></div>';
    const [rt, ru] = el.querySelectorAll(".dm-row");
    (async () => {
      try {
        const m = await Data.market();
        const one = (s, name) => { const n = s ? s.close.length : 0; if (n < 2) return cell(name, "—", null); const c = s.close[n - 1], p = s.close[n - 2]; return cell(name, App.fmtNum(c, 2), (c / p - 1) * 100); };
        let ud = "";
        try { const a = await Data.twAll(); const ch = a.rows.map((r) => r.change_pct).filter(isNum); ud = '<span class="dm-c"><span>漲／跌</span><b><span class="up">' + ch.filter((x) => x > 0).length + '</span>／<span class="down">' + ch.filter((x) => x < 0).length + "</span></b></span>"; } catch (e) {}
        const n = m.taiex.volume.length;
        rt.innerHTML = '<b class="dm-mk">台股</b>' + one(m.taiex, "加權") + one(m.otc, "櫃買") + '<span class="dm-c"><span>成交</span><b>' + App.fmtNum(m.taiex.volume[n - 1] / 1e8, 0) + " 億</b></span>" + ud + '<span class="updated">' + m.taiex.dates[n - 1].slice(5) + "</span>";
      } catch (e) { rt.innerHTML = '<b class="dm-mk">台股</b><span class="updated">— 讀不到 market.json</span>'; }
      try {
        const q = (await Data.json("api/quotes?set=us")).quotes, by = Object.fromEntries(q.map((x) => [x.key, x]));
        ru.innerHTML = '<b class="dm-mk">美股</b>' + [["GSPC", "S&P 500"], ["IXIC", "Nasdaq"], ["SOX", "費半"], ["VIX", "VIX"]].map(([k, t]) => { const x = by[k]; return x && isNum(x.price) ? cell(t, App.fmtNum(x.price, 2), x.change_pct) : cell(t, "—", null); }).join("") +
          '<span class="updated">' + ((by.GSPC && by.GSPC.time) || "").slice(5) + "（延遲）</span>";
      } catch (e) { ru.innerHTML = '<b class="dm-mk">美股</b><span class="updated">— 即時行情暫時抓不到</span>'; }
    })();
  });
})();
