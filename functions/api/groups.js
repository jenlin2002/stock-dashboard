// Cloudflare Pages Function：POST /api/groups  {groups: [{name, items: ["tw:2330", "us:AAPL", ...]}, ...]}
// 自選股分頁（名稱、順序、每頁有哪些股票）整份寫進 GitHub 上的 config/groups.json（commit 到 main）。
// 這個檔案不會觸發抓資料的排程（排程只看 config/watchlist.json）；哪些股票要抓資料仍由 watchlist.json 決定。
// 權杖、來源檢查同 watchlist.js（GITHUB_TOKEN；只允許本站送出）。

const PATH = "config/groups.json";
const MAX_GROUPS = 30, MAX_ITEMS = 300;
const KEY = /^(tw:[0-9A-Z]{4,6}|us:[A-Z][A-Z.\-]{0,9})$/;

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return json({ error: "不允許的來源" }, 403);
  const token = String(env.GITHUB_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  if (!token) return json({ error: "尚未設定 GITHUB_TOKEN（Cloudflare → stock-dashboard → Settings → Variables and Secrets）" }, 501);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "格式錯誤" }, 400); }
  const groups = clean(body && body.groups);
  if (!groups) return json({ error: "分頁資料不正確" }, 400);

  const repo = env.GITHUB_REPO || "jenlin2002/stock-dashboard";
  const message = "自選股分頁：" + groups.map((g) => g.name + "（" + g.items.length + "）").join("、");
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await gh(token, "GET", "/repos/" + repo + "/contents/" + PATH + "?ref=main");
    if (file.status === 401) return json({ error: "GitHub 權杖無效（401）" }, 502);
    if (!file.ok && file.status !== 404) return json({ error: "讀取 GitHub 失敗：" + file.error }, 502);
    const put = await gh(token, "PUT", "/repos/" + repo + "/contents/" + PATH, Object.assign(
      { message: message.slice(0, 200), branch: "main", content: b64encode(format(groups)) },
      file.ok ? { sha: file.data.sha } : {}));
    if (put.ok) return json({ ok: true, groups });
    if (put.status !== 409 && put.status !== 422) return json({ error: "寫入 GitHub 失敗：" + put.error }, 502);
  }
  return json({ error: "分頁剛被其他地方修改，請重新整理後再試" }, 409);
}

// 檢查格式：名稱去掉控制字元、最多 16 字；代號格式正確、不重複
function clean(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_GROUPS) return null;
  const out = [];
  for (const g of list) {
    const name = String((g && g.name) || "").replace(/[\u0000-\u001f"\\<>]/g, "").trim().slice(0, 16);
    if (!name || !Array.isArray(g.items) || g.items.length > MAX_ITEMS) return null;
    const items = [...new Set(g.items.map((k) => String(k).trim()))];
    if (!items.every((k) => KEY.test(k))) return null;
    out.push({ name, items });
  }
  return out;
}

// 每個分頁一行，方便在 GitHub 上看
function format(groups) {
  return "{\n  \"groups\": [\n" + groups.map((g) => "    { \"name\": " + JSON.stringify(g.name) + ", \"items\": " + JSON.stringify(g.items) + " }").join(",\n") + "\n  ]\n}\n";
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function gh(token, method, path, body) {
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
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

function b64encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
