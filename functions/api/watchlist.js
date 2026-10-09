// Cloudflare Pages Function：POST /api/watchlist  {action: "add" | "remove", market: "tw" | "us", item}
// 直接修改 GitHub 上的 config/watchlist.json（commit 到 main）→ 觸發排程抓資料、Cloudflare 重新部署。
// 環境變數（Cloudflare Pages → Settings → Variables and Secrets，類型 Secret）：
//   GITHUB_TOKEN：fine-grained personal access token，只授權 stock-dashboard 這個 repo 的 Contents: Read and write
//   GITHUB_REPO（選填）：預設 jenlin2002/stock-dashboard
// 網站整個在 Cloudflare Access 後面，只有本人能呼叫；另外檢查 Origin 防止別的網站代送請求。

const PATH = "config/watchlist.json";
const US_EXCHANGES = ["NASDAQ", "NYSE", "CBOE", "AMEX"];

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return json({ error: "不允許的來源" }, 403);
  if (!env.GITHUB_TOKEN) return json({ error: "尚未設定 GITHUB_TOKEN（Cloudflare → stock-dashboard → Settings → Variables and Secrets）" }, 501);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "格式錯誤" }, 400); }
  const { action, market } = body || {};
  if (!["add", "remove"].includes(action) || !["tw", "us"].includes(market)) return json({ error: "格式錯誤" }, 400);
  const item = clean(market, body.item || {});
  if (!item) return json({ error: "股票資料不正確" }, 400);
  const sym = market === "tw" ? item.code : item.ticker;
  const same = (x) => (market === "tw" ? x.code === sym : String(x.ticker).toUpperCase() === sym);

  const repo = env.GITHUB_REPO || "jenlin2002/stock-dashboard";
  // 兩人（或兩個分頁）同時改會撞到 sha，重試一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await gh(env, "GET", "/repos/" + repo + "/contents/" + PATH + "?ref=main");
    if (!file.ok) return json({ error: "讀取 GitHub 失敗：" + file.error }, 502);
    let w;
    try { w = JSON.parse(b64decode(file.data.content)); } catch (e) { return json({ error: "watchlist.json 格式壞了，請到 GitHub 修正" }, 500); }
    w.tw = w.tw || [];
    w.us = w.us || [];
    const list = w[market];

    let message;
    if (action === "add") {
      if (list.some(same)) return json({ ok: true, unchanged: true, watchlist: w });
      list.push(item);
      if (market === "tw") list.sort((a, b) => (a.code < b.code ? -1 : 1));  // 台股依代號排
      message = "追蹤清單：新增 " + sym + " " + item.name;
    } else {
      const before = list.length;
      w[market] = list.filter((x) => !same(x));
      if (w[market].length === before) return json({ ok: true, unchanged: true, watchlist: w });
      message = "追蹤清單：移除 " + sym + " " + item.name;
    }

    const put = await gh(env, "PUT", "/repos/" + repo + "/contents/" + PATH, {
      message, branch: "main", sha: file.data.sha, content: b64encode(format(w)),
    });
    if (put.ok) return json({ ok: true, message, watchlist: w });
    if (put.status !== 409) return json({ error: "寫入 GitHub 失敗：" + put.error }, 502);
  }
  return json({ error: "清單剛被其他地方修改，請重新整理後再試" }, 409);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

// 只留需要的欄位、檢查格式，避免把奇怪的東西寫進 repo
function clean(market, x) {
  const name = String(x.name || "").replace(/[\u0000-\u001f"\\]/g, "").trim().slice(0, 40);
  if (market === "tw") {
    const code = String(x.code || "").trim().toUpperCase();
    const mk = x.market === "TPEX" ? "TPEX" : "TWSE";
    return /^[0-9A-Z]{4,6}$/.test(code) ? { code, name: name || code, market: mk } : null;
  }
  const ticker = String(x.ticker || "").trim().toUpperCase();
  const exchange = US_EXCHANGES.includes(String(x.exchange || "").toUpperCase()) ? String(x.exchange).toUpperCase() : "NASDAQ";
  return /^[A-Z][A-Z.\-]{0,9}$/.test(ticker) ? { ticker, name: name || ticker, exchange } : null;
}

// 與手寫的 watchlist.json 同樣的排版：每檔一行
function format(w) {
  const line = (o) => "    { " + Object.entries(o).map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v)).join(", ") + " }";
  return "{\n  \"tw\": [\n" + w.tw.map(line).join(",\n") + "\n  ],\n  \"us\": [\n" + w.us.map(line).join(",\n") + "\n  ]\n}\n";
}

async function gh(env, method, path, body) {
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "stock-dashboard",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data, error: r.status + " " + (data.message || "") };
}

// GitHub 的 content 是 UTF-8 的 base64（中文名稱要正確處理）
function b64decode(s) {
  const bin = atob(String(s).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function b64encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
