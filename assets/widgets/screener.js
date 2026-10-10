// 區塊：選股器表格（A 版）。快速條件 chip 可以多選（同時符合），欄位：代號、名稱、股價、漲跌、EPS(4Q)、本益比、PEG、ROE、殖利率、訊號、＋自選。
// 資料：全台股總表 data/all/stocks.json（每天收盤後更新）。PEG 沒有時用推估 PEG（營收成長）。
// 需要新資料的條件（EPS 連 3 季成長、外資連買、站上季線、融資減股價漲）先顯示成灰色，等第 7 步補資料。
// 美股：目前只有 Nasdaq 選股器的價格、市值、產業（us_stocks.json），EPS／PEG 等待補。
// 參數：market "tw"|"us"|"both"（both 用台股）、rows 一次顯示幾列（預設 30）
(function () {
  const isNum = (x) => App.isNum(x);
  const pegOf = (s) => (isNum(s.peg) ? s.peg : s.peg_est);
  const CHIPS = [
    { k: "peg1", t: "PEG < 1", f: (s) => isNum(pegOf(s)) && pegOf(s) > 0 && pegOf(s) < 1 },
    { k: "eps3", t: "EPS 連 3 季成長", need: "每季 EPS 歷史" },
    { k: "roe15", t: "ROE > 15%", f: (s) => isNum(s.roe) && s.roe > 15 },
    { k: "yld5", t: "殖利率 > 5%", f: (s) => isNum(s.yield) && s.yield > 5 },
    { k: "fi3", t: "外資連買 3 日", need: "個股法人買賣超" },
    { k: "ma", t: "站上季線＋多頭排列", need: "全市場均線" },
    { k: "mg", t: "融資減股價漲", need: "個股融資餘額" },
  ];
  const signals = (s) => {
    const out = [];
    if (CHIPS[0].f(s)) out.push(isNum(s.peg) ? "PEG<1" : "推估PEG<1");
    if (isNum(s.eps_growth) && s.eps_growth >= 20) out.push("EPS 成長 " + Math.round(s.eps_growth) + "%");
    if (CHIPS[2].f(s)) out.push("ROE 高");
    if (CHIPS[3].f(s)) out.push("高殖利率");
    if (isNum(s.rev_yoy) && s.rev_yoy >= 30) out.push("月營收 +" + Math.round(s.rev_yoy) + "%");
    return out;
  };
  const COLS = {
    tw: [
      { k: "code", t: "代號", l: true, s: "str" }, { k: "name", t: "名稱", l: true, s: "str" },
      { k: "close", t: "股價", f: (s) => App.fmtPrice(s.close) },
      { k: "change_pct", t: "漲跌", f: (s) => '<span class="' + App.upDown(s.change_pct) + '">' + App.fmtPct(s.change_pct, true) + "</span>" },
      { k: "eps_ttm", t: "EPS(4Q)", f: (s) => App.fmtNum(s.eps_ttm, 2) },
      { k: "pe", t: "本益比", asc: true, f: (s) => App.fmtNum(s.pe, 1) },
      { k: "_peg", t: "PEG", asc: true, f: (s) => (isNum(s.peg) ? App.fmtNum(s.peg, 2) : isNum(s.peg_est) ? '<span title="推估：用累計營收成長代替 EPS 成長">' + App.fmtNum(s.peg_est, 2) + "*</span>" : "—") },
      { k: "roe", t: "ROE", f: (s) => (isNum(s.roe) ? App.fmtNum(s.roe, 1) + "%" : "—") },
      { k: "yield", t: "殖利率", f: (s) => (isNum(s.yield) ? App.fmtNum(s.yield, 2) + "%" : "—") },
      { k: "_sig", t: "訊號", l: true, nosort: true, f: (s) => signals(s).map((x) => '<span class="sig">' + x + "</span>").join(" ") || '<span class="updated">—</span>' },
    ],
    us: [
      { k: "code", t: "代號", l: true, s: "str" }, { k: "name", t: "名稱", l: true, s: "str" },
      { k: "close", t: "股價", f: (s) => (isNum(s.close) ? "$" + App.fmtPrice(s.close) : "—") },
      { k: "change_pct", t: "漲跌", f: (s) => '<span class="' + App.upDown(s.change_pct) + '">' + App.fmtPct(s.change_pct, true) + "</span>" },
      { k: "mktcap", t: "市值", f: (s) => (isNum(s.mktcap) ? "$" + App.fmtNum(s.mktcap / 1e9, 1) + "B" : "—") },
      { k: "sector", t: "產業", l: true, s: "str", f: (s) => App.esc(s.sector || "—") },
    ],
  };

  Widgets.register("screener", (el, o) => {
    el.classList.add("w-screener");
    const st = { mk: o.market === "us" ? "us" : "tw", on: new Set(), key: "mktcap", dir: -1, show: +o.rows || 30 };
    el.innerHTML = (o.title === false ? "" : '<div class="w-head"><h3>選股器</h3><span class="updated" data-c="asof"></span></div>') +
      '<div class="chips" data-c="chips"></div><p class="updated sc-count" data-c="count"></p>' +
      '<div class="table-wrap big-table" data-c="table"></div><div class="sc-more" data-c="more"></div>';
    const q = (c) => el.querySelector('[data-c="' + c + '"]');

    async function draw() {
      const mk = st.mk;
      q("chips").innerHTML = mk === "us" ? '<span class="updated">美股選股欄位（EPS、PEG、營收成長、自由現金流）待補，先依市值排序。</span>'
        : CHIPS.map((c) => '<button type="button" class="chip" data-k="' + c.k + '" aria-pressed="' + st.on.has(c.k) + '"' +
          (c.need ? ' disabled title="需要「' + c.need + '」資料，待補（LAYOUT-SPEC 第 7 步）"' : "") + ">" + c.t + (c.need ? "（待補）" : "") + "</button>").join("");
      let t;
      try { t = await (mk === "tw" ? Data.twAll() : Data.usAll()); } catch (e) { q("table").innerHTML = '<p class="note">— 讀不到資料（' + App.esc(e.message) + "）</p>"; return; }
      if (st.mk !== mk) return;
      const asof = q("asof");
      if (asof) asof.textContent = (mk === "tw" ? "全台股總表 " : "Nasdaq 選股器 ") + t.updated + "（收盤後更新）";
      let rows = t.rows.filter((s) => isNum(s.close));
      for (const k of st.on) { const c = CHIPS.find((x) => x.k === k); if (c && c.f) rows = rows.filter(c.f); }
      const cols = COLS[mk];
      const val = (s) => (st.key === "_peg" ? pegOf(s) : s[st.key]);
      rows.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y, "zh-TW") : x - y) * st.dir;
      });
      q("count").textContent = "符合 " + rows.length.toLocaleString() + " 檔" + (st.on.size ? "（" + [...st.on].map((k) => CHIPS.find((c) => c.k === k).t).join("＋") + "）" : "") + "，依" + ((cols.find((c) => c.k === st.key) || { t: "市值" }).t) + (st.dir > 0 ? "由小到大" : "由大到小");
      const show = rows.slice(0, st.show);
      q("table").innerHTML = "<table><thead><tr>" + cols.map((c) =>
        '<th class="' + (c.nosort ? "" : "sort") + (c.l ? " l" : "") + '"' + (c.nosort ? "" : ' data-k="' + c.k + '" tabindex="0"') + (st.key === c.k ? ' aria-sort="' + (st.dir > 0 ? "ascending" : "descending") + '"' : "") + ">" + c.t + "</th>").join("") +
        "<th>自選</th></tr></thead><tbody>" +
        show.map((s) => '<tr class="link" data-code="' + App.esc(s.code) + '">' + cols.map((c) => "<td" + (c.l ? ' class="l"' : "") + ">" + (c.f ? c.f(s) : App.esc(s[c.k])) + "</td>").join("") +
          '<td><button type="button" class="btn fav-btn" data-fav="' + App.esc(s.code) + '" aria-label="加入自選 ' + App.esc(s.name) + '">＋自選</button></td></tr>').join("") +
        "</tbody></table>";
      q("more").innerHTML = rows.length > show.length ? '<button type="button" class="btn" data-act="more">再顯示 30 檔（還有 ' + (rows.length - show.length) + " 檔）</button>" : "";
      byCode = t.by;
    }
    let byCode = new Map();
    el.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip[data-k]");
      if (chip && !chip.disabled) { st.on.has(chip.dataset.k) ? st.on.delete(chip.dataset.k) : st.on.add(chip.dataset.k); st.show = +o.rows || 30; draw(); return; }
      const th = e.target.closest("th[data-k]");
      if (th) { const c = COLS[st.mk].find((x) => x.k === th.dataset.k); st.dir = st.key === c.k ? -st.dir : (c.asc || c.s === "str" ? 1 : -1); st.key = c.k; draw(); return; }
      if (e.target.closest('[data-act="more"]')) { st.show += 30; draw(); return; }
      const fav = e.target.closest("[data-fav]");
      if (fav) {
        const s = byCode.get(fav.dataset.fav.toUpperCase()) || {};
        AddFav.open(fav, { m: st.mk, code: fav.dataset.fav, name: s.name, market: s.market });
        return;
      }
      const tr = e.target.closest("tr[data-code]");
      if (tr) {
        const ev = new CustomEvent("sd:pick", { bubbles: true, cancelable: true, detail: { market: st.mk, symbol: tr.dataset.code } });
        if (tr.dispatchEvent(ev)) location.href = "stock.html?symbol=" + encodeURIComponent(tr.dataset.code) + "&m=" + st.mk;
      }
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("th[data-k]")) e.target.click(); });
    draw();
    return { update(n) { const m = n.market === "us" ? "us" : "tw"; if (n.market && m !== st.mk) { st.mk = m; st.on.clear(); st.key = "mktcap"; st.dir = -1; draw(); } } };
  });
})();
