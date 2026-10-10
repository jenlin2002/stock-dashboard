// 區塊：KPI 卡（LAYOUT-SPEC.md A 版：加權、成交金額、漲跌家數、三大法人、融資餘額、台指期基差；沿用大盤頁的算法）
// 參數：market "tw"|"us"|"both"。美股：S&P 500、Nasdaq、道瓊、費半、VIX、10 年債（延遲報價）。
(function () {
  const isNum = (x) => App.isNum(x), yi = (x) => (isNum(x) ? x / 1e8 : null);
  const fmt = (x, d) => App.fmtNum(x, d == null ? 2 : d);
  const signed = (x, d) => (isNum(x) ? (x > 0 ? "+" : x < 0 ? "−" : "") + App.fmtNum(Math.abs(x), d == null ? 2 : d) : "—");
  const card = (name, val, sub, cls, asof) => '<div class="tile"><div class="t-name">' + name + (asof ? ' <span class="updated">' + asof + "</span>" : "") + '</div><div class="t-val ' + (cls || "") + '">' + val + '</div><div class="t-sub">' + (sub || "") + "</div></div>";
  const last2 = (s) => { const n = s ? s.close.length : 0; return n >= 2 ? { c: s.close[n - 1], p: s.close[n - 2], v: s.volume[n - 1], d: s.dates[n - 1] } : null; };

  async function twCards() {
    const out = [];
    let m;
    try { m = await Data.market(); } catch (e) { return [card("台股大盤", "—", "讀不到 data/market.json：" + App.esc(e.message))]; }
    const t = last2(m.taiex), o = last2(m.otc), x = last2(m.tx);
    out.push(t ? card("加權指數", fmt(t.c), '<span class="' + App.upDown(t.c - t.p) + '">' + signed(t.c - t.p) + "（" + App.fmtPct((t.c / t.p - 1) * 100, true) + "）</span>", App.upDown(t.c - t.p), t.d.slice(5)) : card("加權指數", "—", "沒有資料"));
    if (t) {
      const n = m.taiex.volume.length, on = m.otc ? m.otc.volume.length : 0;
      const tot = (m.taiex.volume[n - 1] || 0) + (on ? m.otc.volume[on - 1] || 0 : 0);
      let avg = 0;
      for (let i = 1; i <= 5; i++) avg += (m.taiex.volume[n - 1 - i] || 0) + (on ? m.otc.volume[on - 1 - i] || 0 : 0);
      avg /= 5;
      out.push(card("成交金額（上市＋上櫃）", fmt(yi(tot), 0) + " 億", "5 日均 " + fmt(yi(avg), 0) + " 億（" + App.fmtPct((tot / avg - 1) * 100, true) + "）", "", t.d.slice(5)));
    } else out.push(card("成交金額", "—", "沒有資料"));
    try {
      const a = await Data.twAll();
      const ch = a.rows.map((r) => r.change_pct).filter(isNum);
      const up = ch.filter((v) => v > 0).length, down = ch.filter((v) => v < 0).length;
      out.push(card("漲跌家數", '<span class="up">' + up + '</span>／<span class="down">' + down + "</span>", "平盤 " + (ch.length - up - down) + "・漲停 " + ch.filter((v) => v >= 9.5).length + "・跌停 " + ch.filter((v) => v <= -9.5).length, "", a.updated.slice(5)));
    } catch (e) { out.push(card("漲跌家數", "—", "讀不到全台股總表")); }
    const inst = (m.inst || [])[(m.inst || []).length - 1];
    if (inst) {
      const tot = inst.foreign + inst.trust + inst.dealer;
      out.push(card("三大法人買賣超", '<span class="' + App.upDown(tot) + '">' + signed(yi(tot), 1) + " 億</span>", "外資 " + signed(yi(inst.foreign), 1) + "・投信 " + signed(yi(inst.trust), 1) + "・自營 " + signed(yi(inst.dealer), 1), "", inst.date.slice(5)));
    } else out.push(card("三大法人買賣超", "—", "沒有資料"));
    const mg = m.margin || [];
    if (mg.length >= 2) {
      const a = mg[mg.length - 1], b = mg[mg.length - 2];
      out.push(card("融資餘額", fmt(yi(a.margin), 0) + " 億", "較前日 " + '<span class="' + App.upDown(a.margin - b.margin) + '">' + signed(yi(a.margin - b.margin), 1) + " 億</span>", "", a.date.slice(5)));
    } else out.push(card("融資餘額", "—", "沒有資料"));
    const basis = t && x && t.d === x.d ? x.c - t.c : null;
    out.push(x ? card("台指期基差", '<span class="' + App.upDown(basis) + '">' + signed(basis, 0) + "</span>", (m.tx.contract || "") + " " + fmt(x.c, 0) + "（" + App.fmtPct((x.c / x.p - 1) * 100, true) + "）" + (basis == null ? "・日期不同，不計算" : ""), "", x.d.slice(5)) : card("台指期基差", "—", "沒有資料"));
    return out;
  }
  async function usCards() {
    try {
      const q = (await Data.json("api/quotes?set=us")).quotes;
      return [["GSPC", "S&P 500"], ["IXIC", "Nasdaq"], ["DJI", "道瓊工業"], ["SOX", "費城半導體"], ["VIX", "VIX 恐慌指數"], ["TNX", "10 年期公債殖利率"]].map(([k, name]) => {
        const x = q.find((y) => y.key === k);
        if (!x || !isNum(x.price)) return card(name, "—", "暫時抓不到");
        return card(name, fmt(x.price, k === "TNX" ? 3 : 2), '<span class="' + App.upDown(x.change) + '">' + signed(x.change, k === "TNX" ? 3 : 2) + "（" + App.fmtPct(x.change_pct, true) + "）</span>", App.upDown(x.change), x.time.slice(5));
      });
    } catch (e) { return [card("美股指數", "—", "即時行情暫時抓不到")]; }
  }

  Widgets.register("kpis", (el, o) => {
    el.classList.add("w-kpis");
    let cur = o.market || "tw", seq = 0;
    async function draw() {
      const my = ++seq;
      el.innerHTML = '<div class="tiles"><p class="note">讀取中…</p></div>';
      const parts = cur === "us" ? [await usCards()] : cur === "both" ? [await twCards(), await usCards()] : [await twCards()];
      if (my !== seq) return;
      el.innerHTML = parts.map((p) => '<div class="tiles">' + p.join("") + "</div>").join("");
    }
    draw();
    return { update(n) { if (n.market && n.market !== cur) { cur = n.market; draw(); } } };
  });
})();
