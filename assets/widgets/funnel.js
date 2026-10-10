// 區塊：選股漏斗（C 版中欄）：策略卡 → 篩選漏斗（每一層剩幾檔）→ 結果列（名稱、產業、股價、四面評分圓點、PEG、☆ 自選）。
// 結果可以「全部加入自選」「匯出 CSV」。點一列發出 "sd:pick"（C 版打開右邊的個股抽屜）。
// 也可以改成顯示某個自選清單：widget.showList(名稱, ["tw:2330", …])，「回到策略」回來。
// 資料：全台股總表；月營收創高用 data/all/revenue_hist.json（近 13 個月）；籌碼集中、技術突破用 data/screener-tw.json（沒有時灰掉）。
(function () {
  const isNum = (x) => App.isNum(x);
  const pegOf = (s) => (isNum(s.peg) ? s.peg : s.peg_est);
  const STRATS = {
    tw: [
      { k: "garp", t: "成長 GARP", d: "EPS 成長、PEG 便宜、ROE 好", steps: [["EPS 成長 ≥ 15%", (s) => s.eps_growth >= 15], ["PEG ≤ 1", (s) => pegOf(s) > 0 && pegOf(s) <= 1], ["ROE ≥ 10%", (s) => s.roe >= 10]] },
      { k: "div", t: "穩定存股", d: "高殖利率、有賺錢、不貴", steps: [["近四季 EPS > 0", (s) => s.eps_ttm > 0], ["殖利率 ≥ 4%", (s) => s.yield >= 4], ["ROE ≥ 10%", (s) => s.roe >= 10], ["本益比 ≤ 20", (s) => s.pe > 0 && s.pe <= 20]] },
      { k: "chip", t: "籌碼集中", d: "外資連買、投信買超、融資減少", data: true, steps: [["外資連買 ≥ 3 日", (s) => s.fi_days >= 3], ["投信 5 日買超", (s) => s.it_5 > 0], ["融資 5 日減少", (s) => s.mg_chg5 < 0]] },
      { k: "break", t: "技術突破", d: "站上季線、多頭排列、60 日新高、帶量", data: true, steps: [["站上季線（MA60）", (s) => s.above60 === 1], ["多頭排列 MA5>MA20>MA60", (s) => s.bull === 1], ["創 60 日新高", (s) => s.high60 === 1], ["量比 ≥ 1.5（今日量 ÷ 20 日均量）", (s) => s.vol_ratio >= 1.5]] },
      { k: "revhigh", t: "月營收創高", d: "最新月營收創近 13 個月新高", rev: true, steps: [["月營收創近 13 個月新高", (s, x) => x.revHigh.has(s.code)], ["月營收年增 ≥ 20%", (s) => s.rev_yoy >= 20], ["近四季 EPS > 0", (s) => s.eps_ttm > 0]] },
    ],
    us: [
      { k: "r40", t: "美股 Rule of 40", d: "營收成長＋自由現金流率 ≥ 40%", need: "美股營收成長、自由現金流" },
    ],
  };
  async function revHighSet() {
    const h = await Data.json("data/all/revenue_hist.json");
    const months = Object.keys(h).sort(), last = months[months.length - 1], out = new Set();
    for (const [code, v] of Object.entries(h[last] || {})) {
      const r = v && v[0];
      if (!isNum(r) || r <= 0) continue;
      if (months.slice(0, -1).every((m) => !(h[m] && h[m][code]) || !isNum(h[m][code][0]) || h[m][code][0] < r)) out.add(code);
    }
    return { set: out, month: last };
  }

  Widgets.register("funnel", (el, o) => {
    el.classList.add("w-funnel");
    const st = { mk: "tw", strat: "garp", list: null, show: 50 };
    el.innerHTML =
      '<div class="w-head"><h3 data-c="title">策略選股</h3><span class="seg" data-c="mk"></span><span class="updated" data-c="asof"></span></div>' +
      '<div class="fn-strats" data-c="strats"></div><div class="fn-funnel" data-c="funnel"></div>' +
      '<div class="fn-bar"><span class="updated" data-c="count"></span><span class="fn-act"><button type="button" class="btn" data-act="back" hidden>← 回到策略</button>' +
        '<button type="button" class="btn" data-act="favall">☆ 全部加入自選</button><button type="button" class="btn" data-act="csv">匯出 CSV</button></span></div>' +
      '<div class="fn-rows" data-c="rows"></div><div data-c="more"></div>';
    const q = (c) => el.querySelector('[data-c="' + c + '"]');
    let result = [], t = null, extra = { revHigh: new Set() };

    async function draw() {
      q("mk").innerHTML = [["tw", "台股"], ["us", "美股"]].map(([k, x]) => '<button type="button" data-mk="' + k + '" aria-pressed="' + (st.mk === k) + '">' + x + "</button>").join("");
      q("mk").hidden = !!st.list;
      q("title").textContent = st.list ? st.list.name + "（" + st.list.keys.length + " 檔）" : "策略選股";
      el.querySelector('[data-act="back"]').hidden = !st.list;
      q("strats").hidden = q("funnel").hidden = !!st.list;
      let tw, us;
      try { tw = await Data.twAll(); } catch (e) { q("rows").innerHTML = '<p class="note">— 讀不到全台股總表</p>'; return; }
      if (st.list) {
        if (st.list.keys.some((k) => k.startsWith("us:"))) { try { us = await Data.usAll(); } catch (e) {} }
        result = st.list.keys.map((k) => { const [m, c] = k.split(":"); const s = (m === "tw" ? tw.by.get(c) : us && us.by.get(c)) || { code: c, name: c }; return Object.assign({ _m: m }, s); });
        q("asof").textContent = "資料 " + tw.updated;
        return rows(tw);
      }
      const strats = STRATS[st.mk];
      if (!strats.some((s) => s.k === st.strat)) st.strat = strats[0].k;
      const off = (s) => s.need || (s.data && !tw.screener);
      if (off(strats.find((s) => s.k === st.strat) || {})) st.strat = (strats.find((s) => !off(s)) || strats[0]).k;
      q("strats").innerHTML = strats.map((s) => '<button type="button" class="fn-card" data-s="' + s.k + '" aria-pressed="' + (st.strat === s.k) + '"' +
        (off(s) ? ' disabled title="需要「' + (s.need || "選股器資料 data/screener-tw.json") + '」，待補"' : "") + "><b>" + s.t + "</b><span>" + s.d + "</span>" + (off(s) ? "<em>待補</em>" : "") + "</button>").join("");
      const S = strats.find((s) => s.k === st.strat);
      if (S.need) { q("funnel").innerHTML = '<p class="note">— 這個策略需要「' + S.need + "」資料，第 7 步補上。</p>"; q("rows").innerHTML = ""; result = []; return; }
      if (S.rev && !extra.revHigh.size) {
        try { const r = await revHighSet(); extra.revHigh = r.set; extra.revMonth = r.month; } catch (e) { q("funnel").innerHTML = '<p class="note">— 讀不到月營收歷史（revenue_hist.json）</p>'; return; }
      }
      let list = tw.rows.filter((s) => isNum(s.close));
      const layers = [["全部（上市櫃）", list.length]];
      for (const [label, f] of S.steps) { list = list.filter((s) => f(s, extra)); layers.push([label, list.length]); }
      const max = layers[0][1] || 1;
      q("funnel").innerHTML = layers.map(([label, n], i) => '<div class="fn-layer" style="--w:' + Math.max(18, n / max * 100).toFixed(1) + '%"><span>' + (i ? "＋ " : "") + label + "</span><b>" + n.toLocaleString() + " 檔</b></div>").join("");
      q("asof").textContent = "資料 " + tw.updated + (S.rev && extra.revMonth ? "・營收 " + extra.revMonth : "") + (S.data && tw.screener ? "・價量 " + tw.screener.price_date + "・法人 " + tw.screener.inst_date : "");
      result = list.sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0)).map((s) => Object.assign({ _m: "tw" }, s));
      rows(tw);
    }
    function rows(tw) {
      const f = Scoring.faces(tw.rows);
      q("count").textContent = "共 " + result.length + " 檔" + (st.list ? "" : "，依市值排序");
      q("rows").innerHTML = result.length ? '<div class="table-wrap"><table><thead><tr><th class="l">名稱</th><th class="l">產業</th><th>股價</th><th>漲跌</th><th class="l" title="基＝基本面、價＝評價、技＝技術面、籌＝籌碼面（0–100）">四面評分</th><th>PEG</th><th>自選</th></tr></thead><tbody>' +
        result.slice(0, st.show).map((s) => '<tr class="link" data-m="' + s._m + '" data-code="' + App.esc(s.code) + '"><td class="l"><b>' + App.esc(s.name) + '</b> <span class="updated">' + (s._m === "us" ? "美・" : "") + App.esc(s.code) + "</span></td>" +
          '<td class="l">' + App.esc(s.industry || s.sector || "—") + "</td><td>" + (s._m === "us" && isNum(s.close) ? "$" : "") + App.fmtPrice(s.close) + '</td><td class="' + App.upDown(s.change_pct) + '">' + App.fmtPct(s.change_pct, true) + "</td>" +
          '<td class="l">' + Scoring.dots(s._m === "tw" ? f.get(s.code) : null) + "</td><td>" + (isNum(pegOf(s)) ? App.fmtNum(pegOf(s), 2) + (isNum(s.peg) ? "" : "*") : "—") + "</td>" +
          '<td><button type="button" class="btn fav-btn" data-fav aria-label="加入自選 ' + App.esc(s.name) + '">☆ 自選</button></td></tr>').join("") + "</tbody></table></div>"
        : '<p class="note" style="padding:0 14px">— ' + (st.list ? "這個清單還沒有股票（在結果列按「☆ 自選」加入）" : "沒有符合的股票") + "</p>";
      q("more").innerHTML = result.length > st.show ? '<button type="button" class="btn" data-act="more">再顯示 50 檔（還有 ' + (result.length - st.show) + " 檔）</button>" : "";
    }
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      const tr = e.target.closest("tr[data-code]");
      if (b && b.dataset.mk) { st.mk = b.dataset.mk; st.show = 50; draw(); return; }
      if (b && b.dataset.s && !b.disabled) { st.strat = b.dataset.s; st.show = 50; draw(); return; }
      if (b && b.dataset.act === "back") { st.list = null; draw(); return; }
      if (b && b.dataset.act === "more") { st.show += 50; draw(); return; }
      if (b && b.dataset.act === "favall") { if (result.length) AddFav.openMany(b, result.map((s) => ({ m: s._m, code: s.code, name: s.name, market: s.market }))); return; }
      if (b && b.dataset.act === "csv") {
        const qq = (x) => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"';
        const f = t ? Scoring.faces(t.rows) : new Map();
        const lines = ["市場,代號,名稱,產業,股價,漲跌%,PEG,基本面,評價"].concat(result.map((s) => { const sc = f.get(s.code) || {}; return [s._m === "tw" ? "台股" : "美股", s.code, qq(s.name), qq(s.industry || s.sector || ""), s.close, s.change_pct, isNum(pegOf(s)) ? pegOf(s) : "", isNum(sc.fund) ? sc.fund : "", isNum(sc.value) ? sc.value : ""].join(","); }));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n") + "\n"], { type: "text/csv" }));
        a.download = (st.list ? st.list.name : "選股_" + ((STRATS[st.mk].find((x) => x.k === st.strat) || {}).t || "")) + "_" + new Date().toLocaleDateString("sv-SE") + ".csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return;
      }
      if (b && b.hasAttribute("data-fav") && tr) { const s = result.find((x) => x.code === tr.dataset.code) || {}; AddFav.open(b, { m: tr.dataset.m, code: tr.dataset.code, name: s.name, market: s.market }); return; }
      if (tr) {
        el.querySelectorAll("tr.sel").forEach((x) => x.classList.remove("sel"));
        tr.classList.add("sel");
        const ev = new CustomEvent("sd:pick", { bubbles: true, cancelable: true, detail: { market: tr.dataset.m, symbol: tr.dataset.code } });
        if (tr.dispatchEvent(ev)) location.href = "stock.html?symbol=" + encodeURIComponent(tr.dataset.code) + "&m=" + tr.dataset.m;
      }
    });
    Data.twAll().then((x) => { t = x; }).catch(() => {});
    draw();
    return {
      showList(name, keys) { st.list = { name, keys }; st.show = 50; draw(); },
      showStrategy(k, mk) { st.list = null; if (mk) st.mk = mk; if (k) st.strat = k; draw(); },
    };
  });
})();
