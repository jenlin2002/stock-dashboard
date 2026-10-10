// 區塊：選股器（B 版）：左邊條件表單（策略預設＋各條件），右邊結果卡片；每張卡可以選要加到哪個自選清單（AddFav 小選單）。
// 資料：全台股總表（台股）。外資、技術面條件需要新資料，先灰掉（第 7 步）。
(function () {
  const isNum = (x) => App.isNum(x);
  const pegOf = (s) => (isNum(s.peg) ? s.peg : s.peg_est);
  const FIELDS = [
    { k: "eps_growth", t: "EPS 成長 ≥", unit: "%", op: ">=" },
    { k: "peg", t: "PEG ≤", unit: "", op: "<=", get: pegOf, pos: true },
    { k: "roe", t: "ROE ≥", unit: "%", op: ">=" },
    { k: "pe", t: "本益比 ≤", unit: "倍", op: "<=", pos: true },
    { k: "yield", t: "殖利率 ≥", unit: "%", op: ">=" },
    { k: "rev_yoy", t: "月營收年增 ≥", unit: "%", op: ">=" },
  ];
  const PRESETS = [
    { k: "garp", t: "成長 GARP", v: { eps_growth: 15, peg: 1, roe: 10 } },
    { k: "div", t: "穩定存股", v: { yield: 4, roe: 10, pe: 20 } },
    { k: "value", t: "低本益比", v: { pe: 12, roe: 8 } },
    { k: "growth", t: "高成長", v: { eps_growth: 30, rev_yoy: 20 } },
  ];
  Widgets.register("screenerForm", (el, o) => {
    el.classList.add("w-sform");
    const vals = {};
    el.innerHTML =
      '<form class="sfm" data-c="form" aria-label="選股條件">' +
        '<div class="sfm-presets"><span class="updated">策略預設</span>' + PRESETS.map((p) => '<button type="button" class="chip" data-p="' + p.k + '">' + p.t + "</button>").join("") + "</div>" +
        FIELDS.map((f) => '<label class="sfm-f"><span>' + f.t + '</span><input type="number" step="any" inputmode="decimal" data-k="' + f.k + '" placeholder="不限"><i>' + f.unit + "</i></label>").join("") +
        '<label class="sfm-f off" title="需要個股法人資料，待補（第 7 步）"><span>外資連買 ≥</span><input type="number" disabled placeholder="待補"><i>日</i></label>' +
        '<label class="sfm-f off" title="需要全市場均線，待補（第 7 步）"><span>技術面</span><select disabled><option>站上季線（待補）</option></select></label>' +
        '<div class="sfm-act"><button type="button" class="btn" data-act="clear">清除條件</button></div>' +
      '</form><div class="sfm-out"><p class="updated" data-c="count"></p><div class="sfm-cards" data-c="cards"></div><div data-c="more"></div></div>';
    const q = (c) => el.querySelector('[data-c="' + c + '"]');
    let show = 24, t = null;
    async function draw() {
      if (!t) { try { t = await Data.twAll(); } catch (e) { q("cards").innerHTML = '<p class="note">— 讀不到全台股總表</p>'; return; } }
      let rows = t.rows.filter((s) => isNum(s.close));
      for (const f of FIELDS) {
        const v = vals[f.k];
        if (!isNum(v)) continue;
        rows = rows.filter((s) => { const x = f.get ? f.get(s) : s[f.k]; return isNum(x) && (!f.pos || x > 0) && (f.op === ">=" ? x >= v : x <= v); });
      }
      rows.sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
      const used = FIELDS.filter((f) => isNum(vals[f.k])).map((f) => f.t + " " + vals[f.k] + f.unit);
      q("count").textContent = "符合 " + rows.length.toLocaleString() + " 檔" + (used.length ? "（" + used.join("、") + "）" : "（沒有條件：全部）") + "，依市值排序。資料 " + t.updated;
      q("cards").innerHTML = rows.slice(0, show).map((s) =>
        '<article class="sfm-card"><div class="sfm-top"><a href="stock.html?symbol=' + encodeURIComponent(s.code) + '&m=tw" data-pick="' + App.esc(s.code) + '"><b>' + App.esc(s.name) + '</b> <span class="updated">' + App.esc(s.code) + "</span></a>" +
          '<span class="' + App.upDown(s.change_pct) + '">' + App.fmtPrice(s.close) + " " + App.fmtPct(s.change_pct, true) + "</span></div>" +
          '<div class="sfm-kv"><span>EPS 成長 <b>' + (isNum(s.eps_growth) ? App.fmtNum(s.eps_growth, 0) + "%" : "—") + "</b></span><span>PEG <b>" + (isNum(pegOf(s)) ? App.fmtNum(pegOf(s), 2) + (isNum(s.peg) ? "" : "*") : "—") + "</b></span>" +
          "<span>ROE <b>" + (isNum(s.roe) ? App.fmtNum(s.roe, 1) + "%" : "—") + "</b></span><span>本益比 <b>" + App.fmtNum(s.pe, 1) + "</b></span><span>殖利率 <b>" + (isNum(s.yield) ? App.fmtNum(s.yield, 2) + "%" : "—") + "</b></span></div>" +
          '<button type="button" class="btn fav-btn" data-fav="' + App.esc(s.code) + '">＋ 加到自選…</button></article>').join("") || '<p class="note">— 沒有符合的股票，放寬條件試試</p>';
      q("more").innerHTML = rows.length > show ? '<button type="button" class="btn" data-act="more">再顯示 24 檔（還有 ' + (rows.length - show) + " 檔）</button>" : "";
    }
    q("form").addEventListener("input", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      vals[k] = e.target.value === "" ? null : parseFloat(e.target.value);
      el.querySelectorAll(".sfm-presets .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      show = 24; draw();
    });
    el.addEventListener("click", (e) => {
      const p = e.target.closest("[data-p]");
      if (p) {
        const pr = PRESETS.find((x) => x.k === p.dataset.p);
        FIELDS.forEach((f) => { vals[f.k] = pr.v[f.k] != null ? pr.v[f.k] : null; el.querySelector('input[data-k="' + f.k + '"]').value = vals[f.k] != null ? vals[f.k] : ""; });
        el.querySelectorAll(".sfm-presets .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === p)));
        show = 24; draw(); return;
      }
      if (e.target.closest('[data-act="clear"]')) { FIELDS.forEach((f) => { vals[f.k] = null; el.querySelector('input[data-k="' + f.k + '"]').value = ""; }); el.querySelectorAll(".sfm-presets .chip").forEach((c) => c.setAttribute("aria-pressed", "false")); draw(); return; }
      if (e.target.closest('[data-act="more"]')) { show += 24; draw(); return; }
      const fav = e.target.closest("[data-fav]");
      if (fav) { const s = t.by.get(fav.dataset.fav.toUpperCase()) || {}; AddFav.open(fav, { m: "tw", code: fav.dataset.fav, name: s.name, market: s.market }); return; }
      const a = e.target.closest("a[data-pick]");
      if (a) {
        const ev = new CustomEvent("sd:pick", { bubbles: true, cancelable: true, detail: { market: "tw", symbol: a.dataset.pick } });
        if (!a.dispatchEvent(ev)) e.preventDefault();
      }
    });
    draw();
  });
})();
