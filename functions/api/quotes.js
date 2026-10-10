// Cloudflare Pages Function：GET /api/quotes?set=us（或 tw）
// 一次回傳一組行情的最新價與漲跌（Yahoo Finance，延遲報價），給大盤頁的行情方塊用。

const SETS = {
  tw: [
    ["TWII", "^TWII", "加權指數"], ["TSM", "TSM", "台積電 ADR"], ["TWD", "TWD=X", "美元兌台幣"],
  ],
  us: [
    ["DJI", "^DJI", "道瓊工業"], ["IXIC", "^IXIC", "那斯達克"], ["GSPC", "^GSPC", "標普 500"], ["SOX", "^SOX", "費城半導體"],
    ["RUT", "^RUT", "羅素 2000"], ["VIX", "^VIX", "VIX 恐慌指數"], ["TNX", "^TNX", "美國 10 年期公債殖利率"],
    ["DXY", "DX-Y.NYB", "美元指數"], ["TWD", "TWD=X", "美元兌台幣"], ["GOLD", "GC=F", "黃金期貨"], ["OIL", "CL=F", "原油期貨"],
    ["TSM", "TSM", "台積電 ADR"],
  ],
};

export async function onRequestGet(ctx) {
  const set = SETS[new URL(ctx.request.url).searchParams.get("set")];
  if (!set) return json({ error: "set 不正確" }, 400);
  const quotes = await Promise.all(set.map(async ([key, ysym, name]) => {
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ysym) + "?interval=1d&range=5d",
        { headers: { "User-Agent": "Mozilla/5.0" } });
      const res = (await r.json()).chart.result[0];
      const meta = res.meta;
      const ts = res.timestamp || [];
      const closes = res.indicators.quote[0].close;
      const price = meta.regularMarketPrice;
      // 前一個交易日收盤：最後一根是今天（盤中或已收盤）就取倒數第二根，否則取最後一根
      const lastDay = ts.length ? Math.floor((ts[ts.length - 1] + meta.gmtoffset) / 86400) : null;
      const nowDay = Math.floor((meta.regularMarketTime + meta.gmtoffset) / 86400);
      const valid = closes.map((c, i) => [c, i]).filter(([c]) => c != null);
      let prev = null;
      if (valid.length) {
        const lastIdx = valid[valid.length - 1][1];
        const isToday = lastIdx === ts.length - 1 && lastDay === nowDay;
        prev = isToday ? (valid.length > 1 ? valid[valid.length - 2][0] : null) : valid[valid.length - 1][0];
      }
      return {
        key, name, price,
        change: prev != null ? price - prev : null,
        change_pct: prev ? (price / prev - 1) * 100 : null,
        time: new Date((meta.regularMarketTime + meta.gmtoffset) * 1000).toISOString().slice(0, 16).replace("T", " "),
      };
    } catch (e) {
      return { key, name, price: null, error: true };
    }
  }));
  return json({ quotes }, 200, { "Cache-Control": "private, max-age=120" });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}),
  });
}
