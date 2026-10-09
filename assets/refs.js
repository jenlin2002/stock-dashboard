// 本益成長比評分卡（仿 Jim Slater REFS）：每個指標兩顆圓圈，m＝和全市場比、s＝和同產業比。
// 圓圈塗滿程度＝五分位：全滿＝最好的 20%（強），¾、½、¼，空心＝最差的 20%（弱）；⊕＝沒有資料；虛線＝同業太少不比較。
// 資料：data/all/stocks.json（全台股總表，scripts/build_all.py）
(function () {
  // better：high＝越高越好、low＝越低越好；positive：只拿大於 0 的數字比（本益比、PEG 等負數無意義）
  const GROUPS = [
    [{ k: "yield", t: "殖利率", u: "%", better: "high" }],
    [
      { k: "pe", t: "本益比", u: "x", better: "low", positive: true },
      { k: "peg", t: "本益成長比 PEG", u: "f", better: "low", positive: true },
      { k: "eps_growth", t: "EPS 成長率", u: "%", better: "high" },
      { k: "roe", t: "股東權益報酬率", u: "%", better: "high" },
      { k: "gross_margin", t: "毛利率", u: "%", better: "high" },
    ],
    [{ k: "debt_ratio", t: "負債比（槓桿）", u: "%", better: "low" }],
    [
      { k: "pb", t: "股價淨值比", u: "x", better: "low", positive: true },
      { k: "psr", t: "股價營收比", u: "x", better: "low", positive: true },
    ],
  ];
  const LEVEL_TEXT = ["最弱的 20%", "後段（20～40%）", "中段（40～60%）", "前段（60～80%）", "最強的 20%"];

  let cache = null;
  function load() {
    if (!cache) {
      cache = App.loadJSON("data/all/stocks.json").then((d) => {
        const rows = d.rows.map((r) => Object.fromEntries(d.fields.map((f, i) => [f, r[i]])));
        return { updated: d.updated, rows, byCode: Object.fromEntries(rows.map((s) => [s.code, s])) };
      }).catch((e) => { cache = null; throw e; });
    }
    return cache;
  }

  // 五分位：0（最差 20%）～ 4（最好 20%）；樣本少於 5 個回傳 null
  function level(value, peers, m) {
    const ok = (x) => App.isNum(x) && (!m.positive || x > 0);
    if (!ok(value)) return undefined;  // 本身沒有資料
    const vals = peers.map((s) => s[m.k]).filter(ok);
    if (vals.length < 5) return null;
    const worse = vals.filter((x) => (m.better === "high" ? x < value : x > value)).length;
    const ties = vals.filter((x) => x === value).length;
    const pct = (worse + (ties - 1) / 2) / (vals.length - 1 || 1);  // 0＝最差、1＝最好
    return Math.min(4, Math.floor(pct * 5));
  }

  function dot(lv, scope) {
    if (lv === undefined) return '<span class="refs-dot na" title="' + scope + "：沒有資料\">⊕</span>";
    if (lv === null) return '<span class="refs-dot few" title="' + scope + '：同業太少，不比較"></span>';
    return '<span class="refs-dot" style="--f:' + lv * 25 + '%" title="' + scope + "：" + LEVEL_TEXT[lv] + '"></span>';
  }

  function fmt(v, m) {
    if (!App.isNum(v)) return "na";
    return (m.u === "%" ? "% " : m.u + " ") + App.fmtNum(v, Math.abs(v) >= 100 ? 0 : 2);
  }

  async function render(host, code) {
    let d;
    try { d = await load(); } catch (e) { host.innerHTML = '<p class="note">讀不到全台股資料（排程執行後才會產生）。</p>'; return false; }
    const s = d.byCode[code];
    if (!s) { host.innerHTML = '<p class="note">全台股總表沒有這檔（可能是 ETF 或剛上市）。</p>'; return false; }
    const peers = d.rows.filter((x) => x.industry === s.industry);
    const capRank = d.rows.filter((x) => App.isNum(x.mktcap)).sort((a, b) => b.mktcap - a.mktcap).findIndex((x) => x.code === code) + 1;
    const yi = (x) => (App.isNum(x) ? App.fmtNum(x / 1e8, x >= 1e11 ? 0 : 1) + " 億" : "na");

    let html =
      '<div class="refs-card">' +
        '<div class="refs-title">' + App.esc(s.name) + " <small>" + App.esc(s.code) + "</small></div>" +
        '<div class="refs-sec refs-price"><div><div>股價</div><small>' + App.esc(s.date || "") + '</small></div><b>' + App.fmtPrice(s.close) + "</b></div>" +
        '<div class="refs-sec">' +
          row("市值", yi(s.mktcap)) +
          row("排名", capRank ? "第 " + capRank + " 名／" + d.rows.filter((x) => App.isNum(x.mktcap)).length : "na") +
          row("市場・產業", (s.market === "TWSE" ? "上市" : "上櫃") + "・" + App.esc(s.industry)) +
        "</div>" +
        '<div class="refs-sec">' +
          row("近四季每股盈餘" + (s.pe_period ? "（至 " + s.pe_period + "）" : ""), App.isNum(s.eps_ttm) ? App.fmtNum(s.eps_ttm, 2) + " 元" : "na") +
          row("近 12 個月營收", yi(s.rev_ttm)) +
          row("營益率（今年累計）", App.isNum(s.op_margin) ? App.fmtPct(s.op_margin) : "na") +
        "</div>";
    GROUPS.forEach((g, gi) => {
      html += '<div class="refs-sec refs-grid">' + (gi === 0 ? '<span class="refs-h"></span><span class="refs-h"></span><span class="refs-h">m</span><span class="refs-h">s</span>' : "");
      g.forEach((m) => {
        const lowBase = m.k === "peg" && !App.isNum(s.peg) && s.eps_growth > 100;  // 成長 > 100%：低基期，PEG 不計
        html += '<span class="refs-l">' + m.t + '</span><span class="refs-v">' + (lowBase ? '<span title="EPS 成長超過 100%，多半是去年基期太低">基期低</span>' : fmt(s[m.k], m)) + "</span>" +
          dot(level(s[m.k], d.rows, m), "和全市場比") + dot(level(s[m.k], peers, m), "和" + s.industry + "比");
      });
      html += "</div>";
    });
    html +=
        '<div class="refs-sec">' +
          row("每股淨值", App.isNum(s.bvps) ? App.fmtNum(s.bvps, 2) + " 元" : "na") +
          row("一年前近四季 EPS", App.isNum(s.eps_prev) ? App.fmtNum(s.eps_prev, 2) + " 元" : "na") +
        "</div>" +
      "</div>";
    host.innerHTML = html;
    return true;

    function row(label, value) { return '<div class="refs-row"><span>' + label + "</span><span>" + value + "</span></div>"; }
  }

  // 全台股總表用：一次算出所有股票某個指標的全市場五分位 {代號: 0～4}
  function levelsFor(rows, k) {
    const m = GROUPS.flat().find((x) => x.k === k);
    const out = {};
    rows.forEach((s) => { out[s.code] = level(s[k], rows, m); });
    return out;
  }

  window.Refs = { render, load, levelsFor, dot, LEVEL_TEXT };
})();
