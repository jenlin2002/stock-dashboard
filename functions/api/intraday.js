// Cloudflare Pages Function：GET /api/intraday?market=tw&symbol=2330&exchange=TWSE&tf=5
// 盤中 K 線（Yahoo Finance chart API，延遲報價）。tf：1、5、15、30、60（分鐘）。
// 回傳 { symbol, tf, price: { dates: [時間戳（秒，已加上交易所時區，畫圖直接顯示當地時間）], open, high, low, close, volume } }
// Yahoo 的上限：1 分鐘最多 7 天、5～30 分鐘 60 天、60 分鐘 2 年。

const RANGE = { 1: "5d", 5: "60d", 15: "60d", 30: "60d", 60: "1y" };

export async function onRequestGet(ctx) {
  const q = new URL(ctx.request.url).searchParams;
  const market = q.get("market");
  const symbol = (q.get("symbol") || "").trim().toUpperCase();
  const tf = +q.get("tf");
  const exchange = (q.get("exchange") || "").toUpperCase();
  if (!RANGE[tf]) return json({ error: "週期不支援" }, 400);
  let ysym;
  if (market === "tw" && /^[0-9A-Z]{4,6}$/.test(symbol)) ysym = symbol + (exchange === "TPEX" ? ".TWO" : ".TW");
  else if (market === "us" && /^[A-Z][A-Z.\-]{0,9}$/.test(symbol)) ysym = symbol.replace(".", "-");
  else return json({ error: "代號格式不正確" }, 400);

  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ysym) + "?interval=" + tf + "m&range=" + RANGE[tf],
    { headers: { "User-Agent": "Mozilla/5.0" } });
  const j = await r.json().catch(() => null);
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) return json({ error: "Yahoo 沒有 " + ysym + " 的盤中資料" }, 404);

  const off = (res.meta && res.meta.gmtoffset) || 0;
  const qd = res.indicators.quote[0];
  const price = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
  const rd = (x) => Math.round(x * 10000) / 10000;
  res.timestamp.forEach((ts, i) => {
    if (qd.close[i] == null || qd.open[i] == null) return;  // 沒成交的空檔
    price.dates.push(ts + off);
    price.open.push(rd(qd.open[i])); price.high.push(rd(qd.high[i]));
    price.low.push(rd(qd.low[i])); price.close.push(rd(qd.close[i]));
    price.volume.push(qd.volume[i] || 0);
  });
  // 盤中資料變化快：瀏覽器只快取 1 分鐘
  return json({ symbol, market: market === "tw" ? "TW" : "US", tf, price }, 200, { "Cache-Control": "private, max-age=60" });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}),
  });
}
