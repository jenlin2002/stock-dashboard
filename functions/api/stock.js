// Cloudflare Pages Function：GET /api/stock?market=tw&symbol=2454&name=聯發科&exchange=TWSE
//                                   /api/stock?market=us&symbol=TSLA&cik=1318605&name=Tesla&exchange=NASDAQ
// 即時抓「不在追蹤清單」的股票，輸出格式與 data/tw/*.json、data/us/*.json 相同（邏輯移植自 scripts/fetch_tw.py、fetch_us.py）。
// 環境變數（Cloudflare Pages → Settings → Variables and Secrets）：FINMIND_TOKEN、SEC_USER_AGENT
// 免費方案每次執行約 10ms CPU：SEC companyfacts 有好幾 MB，用 extractTags() 只擷取需要的欄位，不整個解析。

const YEARS = 5;
const CACHE_SECONDS = 6 * 3600;

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const q = url.searchParams;
  const market = q.get("market");
  const symbol = (q.get("symbol") || "").trim().toUpperCase();
  const cik = parseInt(q.get("cik") || "", 10) || null;
  const name = (q.get("name") || symbol).slice(0, 60);
  const exchange = (q.get("exchange") || "").toUpperCase().slice(0, 10);

  if (!(market === "tw" && /^[0-9A-Z]{4,6}$/.test(symbol)) && !(market === "us" && /^[A-Z][A-Z.\-]{0,9}$/.test(symbol))) {
    return json({ error: "代號格式不正確" }, 400);
  }

  // 同一檔 6 小時內重複查詢直接用快取（pages.dev 上 Cache API 可能無效，瀏覽器端仍有 Cache-Control）
  const cacheKey = new Request(url.origin + "/api/stock?v=1&market=" + market + "&symbol=" + encodeURIComponent(symbol));
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  } catch (e) { /* 沒有快取可用 */ }

  try {
    const data = market === "tw"
      ? await buildTW(symbol, name, exchange || "TWSE", ctx.env)
      : await buildUS(symbol, name, exchange || "NASDAQ", cik, ctx.env);
    if (!data.price.dates.length) return json({ error: "查無股價，請確認代號" }, 404);
    // 財報暫時抓不到（data.notice）的結果只快取 10 分鐘，也不放進共用快取，免得錯誤卡住 6 小時
    const res = json(data, 200, { "Cache-Control": "private, max-age=" + (data.notice ? 600 : CACHE_SECONDS) });
    if (!data.notice) { try { ctx.waitUntil(cache.put(cacheKey, res.clone())); } catch (e) {} }
    return res;
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 502);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}),
  });
}

// ---------- 日期小工具 ----------

function taipeiToday() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
function yearsAgo(n) {
  const t = taipeiToday();
  const y = +t.slice(0, 4) - n;
  return y + t.slice(4).replace("-02-29", "-02-28");
}
function days(s, e) { return (Date.parse(e) - Date.parse(s)) / 864e5; }
function pct(a, b) { return a == null || !b ? null : Math.round((a - b) / Math.abs(b) * 10000) / 100; }
function round(x, d) { const m = Math.pow(10, d); return Math.round(x * m) / m; }

// ---------- 台股（FinMind） ----------

async function buildTW(code, name, exchange, env) {
  const headers = env.FINMIND_TOKEN ? { Authorization: "Bearer " + env.FINMIND_TOKEN } : {};
  const fm = async (dataset, start) => {
    const r = await fetch("https://api.finmindtrade.com/api/v4/data?" + new URLSearchParams({ dataset, data_id: code, start_date: start }), { headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status !== 200) throw new Error("FinMind " + dataset + "：" + (j.msg || r.status));
    return j.data;
  };
  const per0 = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const [priceRows, revRows, finRows, divRows, perRows] = await Promise.all([
    fm("TaiwanStockPrice", yearsAgo(YEARS)),
    fm("TaiwanStockMonthRevenue", yearsAgo(YEARS + 1)),
    fm("TaiwanStockFinancialStatements", yearsAgo(YEARS)),
    fm("TaiwanStockDividend", yearsAgo(YEARS + 1)),
    fm("TaiwanStockPER", per0),
  ]);

  const price = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
  for (const r of priceRows) {
    if (!r.close || !r.Trading_Volume) continue;  // 停牌日
    price.dates.push(r.date); price.open.push(r.open); price.high.push(r.max);
    price.low.push(r.min); price.close.push(r.close); price.volume.push(r.Trading_Volume);
  }

  const rev = {};
  for (const r of revRows) rev[r.revenue_year + "-" + String(r.revenue_month).padStart(2, "0")] = r.revenue;
  const monthly_revenue = Object.keys(rev).sort().map((m) => {
    const y = +m.slice(0, 4), mo = +m.slice(5);
    const prev = mo > 1 ? y + "-" + String(mo - 1).padStart(2, "0") : (y - 1) + "-12";
    return { month: m, revenue: rev[m], yoy: pct(rev[m], rev[(y - 1) + m.slice(4)]), mom: pct(rev[m], rev[prev]) };
  });

  const FIELDS = { Revenue: "revenue", GrossProfit: "gross_profit", OperatingIncome: "operating_income", EquityAttributableToOwnersOfParent: "net_income", EPS: "eps" };
  const byQ = {};
  for (const r of finRows) {
    const k = FIELDS[r.type];
    if (!k) continue;
    const period = r.date.slice(0, 4) + "Q" + (Math.floor((+r.date.slice(5, 7) - 1) / 3) + 1);
    (byQ[period] = byQ[period] || { period })[k] = r.value;
  }
  const quarterly = Object.keys(byQ).sort().map((p) => {
    const x = byQ[p];
    return { period: p, revenue: x.revenue ?? null, gross_profit: x.gross_profit ?? null, operating_income: x.operating_income ?? null, net_income: x.net_income ?? null, eps: x.eps ?? null };
  });

  const firstYear = +taipeiToday().slice(0, 4) - YEARS;
  const byY = {};
  for (const r of divRows) {
    const m = /^(\d+)/.exec(r.year || "");
    if (!m) continue;
    const y = +m[1] + 1911;
    const d = (byY[y] = byY[y] || { year: y, cash: 0, stock: 0 });
    d.cash += (r.CashEarningsDistribution || 0) + (r.CashStatutorySurplus || 0);
    d.stock += (r.StockEarningsDistribution || 0) + (r.StockStatutorySurplus || 0);
  }
  const dividends = Object.values(byY).filter((d) => d.year >= firstYear).sort((a, b) => a.year - b.year)
    .map((d) => ({ year: d.year, cash: round(d.cash, 4), stock: round(d.stock, 4) }));

  const last = perRows[perRows.length - 1];
  const valuation = last
    ? { pe: last.PER || null, pb: last.PBR || null, dividend_yield: last.dividend_yield, date: last.date }
    : { pe: null, pb: null, dividend_yield: null, date: null };

  const t = taipeiToday();
  const roc = (+t.slice(5, 7) >= 6 ? +t.slice(0, 4) - 1 : +t.slice(0, 4) - 2) - 1911;
  return {
    symbol: code, name, market: "TW", exchange, updated: t, live: true,
    price, valuation, monthly_revenue, quarterly, dividends,
    reports: { annual_report_url: "https://doc.twse.com.tw/server-java/t57sb01?step=1&colorchg=1&co_id=" + code + "&year=" + roc + "&mtype=F" },
  };
}

// ---------- 美股（SEC companyconcept + Yahoo Finance） ----------

const FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A"]);
const TAGS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  gross_profit: ["GrossProfit"],
  cost: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  operating_income: ["OperatingIncomeLoss"],
  net_income: ["NetIncomeLoss"],
  eps: ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
};

async function buildUS(ticker, name, exchange, cik, env) {
  let secError = null;
  const [sec, yahoo] = await Promise.all([
    cik ? secData(cik, env).catch((e) => { secError = String(e && e.message || e); return null; }) : Promise.resolve(null),  // ETF 等沒有財報，照樣顯示股價
    yahooData(ticker),
  ]);
  const { price, divEvents } = yahoo;
  const quarterly = sec ? sec.quarterly : [];

  const firstYear = +taipeiToday().slice(0, 4) - YEARS;
  const byY = {};
  for (const e of divEvents) if (+e.date.slice(0, 4) >= firstYear) byY[e.date.slice(0, 4)] = (byY[e.date.slice(0, 4)] || 0) + e.amount;
  const dividends = Object.keys(byY).sort().map((y) => ({ year: +y, cash: round(byY[y], 4), stock: 0 }));

  // 本益比＝收盤 ÷ 近四季 EPS；殖利率＝近 12 個月現金股利 ÷ 收盤（與 yfinance trailingAnnualDividendYield 同義）
  const close = price.close[price.close.length - 1];
  const eps4 = quarterly.slice(-4).map((x) => x.eps);
  const ttm = eps4.length === 4 && eps4.every((x) => typeof x === "number") ? eps4.reduce((a, b) => a + b, 0) : null;
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const div12 = divEvents.filter((e) => e.date > yearAgo).reduce((a, e) => a + e.amount, 0);
  const valuation = {
    pe: ttm > 0 ? round(close / ttm, 2) : null,
    pb: null,
    dividend_yield: close ? round(div12 / close * 100, 2) : null,
    date: price.dates[price.dates.length - 1] || null,
  };

  return {
    symbol: ticker, name, market: "US", exchange, updated: taipeiToday(), live: true, notice: secError ? "財報暫時抓不到（" + secError + "）" : null,
    price, valuation, monthly_revenue: [], quarterly, dividends,
    reports: { annual_report_url: sec && sec.report ? sec.report : "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=" + encodeURIComponent(ticker) + "&type=10-K" },
  };
}

async function yahooData(ticker) {
  // 從 YEARS 年前的 1/1 抓起，股利年度才完整；股價最後再裁成近 YEARS 年
  const firstYear = +taipeiToday().slice(0, 4) - YEARS;
  const p1 = Math.floor(Date.UTC(firstYear, 0, 1) / 1000), p2 = Math.floor(Date.now() / 1000);
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + "?period1=" + p1 + "&period2=" + p2 + "&interval=1d&events=div",
    { headers: { "User-Agent": "Mozilla/5.0" } });
  const j = await r.json().catch(() => null);
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) throw new Error("Yahoo 查無 " + ticker);
  const off = (res.meta && res.meta.gmtoffset) || 0;
  const qd = res.indicators.quote[0];
  const price = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
  const from = yearsAgo(YEARS);
  res.timestamp.forEach((ts, i) => {
    if (qd.close[i] == null || !(qd.close[i] > 0)) return;
    const day = new Date((ts + off) * 1000).toISOString().slice(0, 10);
    if (day < from) return;
    price.dates.push(day);
    price.open.push(round(qd.open[i], 4)); price.high.push(round(qd.high[i], 4));
    price.low.push(round(qd.low[i], 4)); price.close.push(round(qd.close[i], 4));
    price.volume.push(qd.volume[i] || 0);
  });
  const divs = (res.events && res.events.dividends) || {};
  const divEvents = Object.values(divs).map((d) => ({ date: new Date((d.date + off) * 1000).toISOString().slice(0, 10), amount: d.amount })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { price, divEvents };
}

async function secData(cik, env) {
  const headers = { "User-Agent": env.SEC_USER_AGENT || "stock-dashboard personal-research" };
  const id = String(cik).padStart(10, "0");
  const allTags = [...new Set(Object.values(TAGS).flat())];
  // companyfacts 有 3～5MB，整個 JSON.parse 要 20ms 以上（超過免費方案 CPU 上限），所以只掃一遍文字、擷取需要的欄位（約 4ms）。
  // 不用 companyconcept（單一欄位 API）：部分公司（例如 KO）會回傳空資料。
  const [factsText, subs] = await Promise.all([
    fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK" + id + ".json", { headers }).then(async (r) => {
      if (r.status === 403) throw new Error("SEC 拒絕連線，請在 Cloudflare 設定 SEC_USER_AGENT");
      return r.ok ? r.text() : "";
    }),
    fetch("https://data.sec.gov/submissions/CIK" + id + ".json", { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const rowsByTag = extractTags(factsText, new Set(allTags));

  const qv = {};
  for (const tag of allTags) qv[tag] = quarterlyValues(rowsByTag[tag]);
  const merged = (key) => {
    const out = {};
    for (const tag of TAGS[key].slice().reverse()) Object.assign(out, qv[tag]);  // 優先順序高的最後寫入
    return out;
  };
  const vals = Object.fromEntries(Object.keys(TAGS).map((k) => [k, merged(k)]));
  for (const e of Object.keys(vals.revenue)) {
    if (!(e in vals.gross_profit) && e in vals.cost) vals.gross_profit[e] = vals.revenue[e] - vals.cost[e];
  }
  const fyEnds = new Set();
  for (const tag of TAGS.revenue.concat(TAGS.net_income)) {
    for (const r of rowsByTag[tag] || []) if (FORMS.has(r.form) && r.start && days(r.start, r.end) >= 350 && days(r.start, r.end) <= 380) fyEnds.add(r.end);
  }
  const cutoff = yearsAgo(YEARS);
  const quarterly = Object.keys(vals.revenue).filter((e) => e >= cutoff).sort().map((e) => ({
    period: calendarQuarter(e),
    fiscal: fiscalLabel(e, [...fyEnds].sort()),
    end: e,
    revenue: vals.revenue[e] ?? null,
    gross_profit: vals.gross_profit[e] ?? null,
    operating_income: vals.operating_income[e] ?? null,
    net_income: vals.net_income[e] ?? null,
    eps: vals.eps[e] != null ? round(vals.eps[e], 4) : null,
  }));

  let report = null;
  if (subs && subs.filings && subs.filings.recent) {
    const rec = subs.filings.recent;
    const i = rec.form.indexOf("10-K");
    if (i >= 0) report = "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + rec.accessionNumber[i].replace(/-/g, "") + "/" + rec.primaryDocument[i];
  }
  return { quarterly, report };
}

// 從 companyfacts 原文擷取 us-gaap 指定欄位的 USD（或 USD/shares）陣列：{ 欄位: [列, ...] }
// 結構：..."us-gaap":{"欄位":{"label":...,"description":...,"units":{"USD":[{...},...]}},...}
// 陣列裡的物件不含 "]"，所以從 "[" 到下一個 "]" 就是整個陣列；字串裡的引號都有跳脫，不會誤判。
function extractTags(text, wanted) {
  const out = {};
  let p = text.indexOf('"us-gaap":{');
  if (p < 0) return out;
  p += 11;
  const MARK = '":{"label"';
  for (;;) {
    const m = text.indexOf(MARK, p);
    if (m < 0) break;
    const tag = text.slice(text.lastIndexOf('"', m - 1) + 1, m);
    let u = text.indexOf('"units":{', m);
    if (u < 0) break;
    u += 9;
    while (text.charCodeAt(u) === 34) {           // '"'：下一個單位
      const ke = text.indexOf('"', u + 1);
      const as = ke + 2, ae = text.indexOf("]", as);
      if (wanted.has(tag) && !out[tag]) {
        const key = text.slice(u + 1, ke);
        if (key === "USD" || key === "USD/shares") out[tag] = JSON.parse(text.slice(as, ae + 1));
      }
      u = ae + 1;
      if (text.charCodeAt(u) !== 44) break;      // ','
      u++;
    }
    p = u;
  }
  return out;
}

// {季末日: 單季數值}；第 4 季 10-K 只報全年，用「全年 − 前三季累計」推算
function quarterlyValues(rows) {
  const span = new Map();
  for (const r of rows || []) {
    if (!FORMS.has(r.form) || !r.start) continue;
    const k = r.start + "|" + r.end;
    const old = span.get(k);
    if (!old || r.filed > old.filed) span.set(k, { s: r.start, e: r.end, filed: r.filed, val: r.val });
  }
  const q = {};
  for (const x of span.values()) { const d = days(x.s, x.e); if (d >= 80 && d <= 100) q[x.e] = x.val; }
  for (const x of span.values()) {
    const d = days(x.s, x.e);
    if (d < 350 || d > 380 || x.e in q) continue;
    let ytd = null;
    for (const y of span.values()) {
      const dy = days(y.s, y.e);
      if (y.s === x.s && dy >= 260 && dy <= 285 && (!ytd || y.e > ytd.e)) ytd = y;
    }
    if (ytd) q[x.e] = x.val - ytd.val;
  }
  return q;
}

// 對齊最近的日曆季末（NVIDIA 4/26 結束的季 = Q1）
function calendarQuarter(end) {
  const e = Date.parse(end), y = +end.slice(0, 4);
  const cands = [[y - 1, 12, 31], [y, 3, 31], [y, 6, 30], [y, 9, 30], [y, 12, 31]];
  let best = cands[0], bd = Infinity;
  for (const c of cands) {
    const d = Math.abs(Date.UTC(c[0], c[1] - 1, c[2]) - e);
    if (d < bd) { bd = d; best = c; }
  }
  return best[0] + "Q" + (best[1] / 3);  // 月份 3、6、9、12 → Q1～Q4
}

// 財報季，例：FY2027 Q1
function fiscalLabel(end, fyEnds) {
  if (!fyEnds.length) return null;
  const e = Date.parse(end), slack = 5 * 864e5;
  let fye = fyEnds.find((f) => Date.parse(f) >= e - slack);
  if (!fye) {
    let f = fyEnds[fyEnds.length - 1];
    while (Date.parse(f) < e - slack) f = (+f.slice(0, 4) + 1) + "-" + f.slice(5, 7) + "-" + String(Math.min(+f.slice(8, 10), 28)).padStart(2, "0");
    fye = f;
  }
  const qn = 4 - Math.round((Date.parse(fye) - e) / 864e5 / 91.3);
  return "FY" + fye.slice(0, 4) + " Q" + qn;
}
