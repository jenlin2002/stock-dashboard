// Cloudflare Pages Function：台股盤中即時（富果 Fugle 行情 API，免費基本用戶：日內行情每分鐘 60 次）
//   GET /api/rt?symbols=2330,3017,IX0001            → { quotes: { "2330": {...}, ... } }
//   GET /api/rt?symbols=2330&candles=2330&tf=5      → 另外回傳 candles：今天的分鐘 K（tf：1、5、15、30、60）
// 金鑰放在 Cloudflare 環境變數 FUGLE_API_KEY（祕密），不寫在程式裡。
// 指數代號：IX0001＝加權指數、IX0043＝櫃買指數。
// 分鐘 K 的時間換成「台灣時間的時間戳」（秒，+8 小時），跟 intraday.js 的 Yahoo 資料一致，畫圖直接顯示當地時間。
// 個股的量：富果是「張」，這裡換成「股」（×1000），跟日線、Yahoo 一致；指數的量是成交金額（元）。

const BASE = "https://api.fugle.tw/marketdata/v1.0/stock";
const TFS = ["1", "5", "15", "30", "60"];
const SYM = /^(?:[0-9][0-9A-Z]{3,5}|IX[0-9]{4})$/;
const MAX = 20;  // 一次最多幾檔（每檔一次富果呼叫）

export async function onRequestGet(ctx) {
  const key = (ctx.env.FUGLE_API_KEY || "").trim();
  if (!key) return json({ error: "尚未設定 FUGLE_API_KEY", code: "nokey" }, 503);
  const q = new URL(ctx.request.url).searchParams;
  const symbols = [...new Set((q.get("symbols") || "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean))];
  const cs = (q.get("candles") || "").toUpperCase().trim(), tf = q.get("tf") || "1";
  if (symbols.length > MAX || !symbols.every((s) => SYM.test(s))) return json({ error: "代號格式不正確或太多檔" }, 400);
  if (cs && (!SYM.test(cs) || !TFS.includes(tf))) return json({ error: "K 線參數不正確" }, 400);
  if (!symbols.length && !cs) return json({ error: "沒有指定代號" }, 400);

  const get = async (path) => {
    const r = await fetch(BASE + path, { headers: { "X-API-KEY": key } });
    if (r.status === 401 || r.status === 403) throw httpErr(401, "富果金鑰無效（請檢查 FUGLE_API_KEY）");
    if (r.status === 429) throw httpErr(429, "富果呼叫次數超過上限，稍後自動重試");
    if (!r.ok) throw httpErr(r.status === 404 ? 404 : 502, "富果回應 " + r.status);
    return r.json();
  };

  try {
    const out = { quotes: {}, errors: {} };
    const jobs = symbols.map(async (s) => {
      try { out.quotes[s] = quote(await get("/intraday/quote/" + s)); }
      catch (e) { if (e.status === 401 || e.status === 429) throw e; out.errors[s] = e.message; }
    });
    if (cs) jobs.push(get("/intraday/candles/" + cs + "?timeframe=" + tf).then((j) => { out.candles = candles(j, tf); }));
    await Promise.all(jobs);
    return json(out, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return json({ error: e.message, code: e.status === 429 ? "limit" : undefined }, e.status || 502);
  }
}

function quote(j) {
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
  const t = j.total || {};
  const ref = num(j.referencePrice) != null ? j.referencePrice : num(j.previousClose);
  const price = num(j.closePrice) != null ? j.closePrice : num(j.lastPrice);
  const index = String(j.symbol || "").startsWith("IX") || j.type === "INDEX";
  return {
    symbol: j.symbol, name: j.name, date: j.date, index,
    ref, open: num(j.openPrice), high: num(j.highPrice), low: num(j.lowPrice), price,
    change: price != null && ref ? +(price - ref).toFixed(4) : null,
    pct: price != null && ref ? +((price / ref - 1) * 100).toFixed(2) : null,
    vol: num(t.tradeVolume), value: num(t.tradeValue),
    time: j.lastUpdated ? Math.round(j.lastUpdated / 1000) : null,  // 毫秒
    trial: !!j.isTrial, closed: !!j.isClose,
    limitUp: !!j.isLimitUpPrice, limitDown: !!j.isLimitDownPrice,
    bids: (j.bids || []).slice(0, 5), asks: (j.asks || []).slice(0, 5),
  };
}

function candles(j, tf) {
  const index = String(j.symbol || "").startsWith("IX") || j.type === "INDEX";
  const price = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
  (j.data || []).forEach((c) => {
    const t = Date.parse(c.date);
    if (!isFinite(t) || c.close == null) return;
    price.dates.push(Math.round(t / 1000) + 8 * 3600);
    price.open.push(c.open); price.high.push(c.high); price.low.push(c.low); price.close.push(c.close);
    price.volume.push((c.volume || 0) * (index ? 1 : 1000));
  });
  return { symbol: j.symbol, date: j.date, tf, index, price };
}

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}),
  });
}
