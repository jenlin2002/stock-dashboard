// 版面切換（LAYOUT-SPEC.md 第 2 節）：頁首右側「主頁｜A 指揮中心｜B 工作台｜C 選股」，所有頁面都有。
// - 切換時帶著目前的市場（tw／us／both）和股票代號：layout-b.html?market=tw&symbol=2330
// - localStorage「sd.layout」記上次進的版面（a／b／c），「sd.rememberLayout」是主頁的勾選框（預設 true）
// - 「主頁」一律帶 ?home=1，主頁就不會自動轉走
// - 鍵盤：g h 主頁、g a／g b／g c 切版面（輸入框有焦點時不觸發）
// 頁面可以設定 window.SD_STATE = { market, symbol }（或在之後呼叫 LayoutSwitch.setState）讓切換帶著走。
(function () {
  const LAYOUTS = [
    { key: "home", label: "主頁", short: "⌂", href: "index.html", title: "主頁：選版面" },
    { key: "a", label: "A 指揮中心", short: "A", href: "layout-a.html", title: "A 指揮中心（深色、一頁看完）" },
    { key: "b", label: "B 工作台", short: "B", href: "layout-b.html", title: "B 分頁工作台（分頁切換）" },
    { key: "c", label: "C 選股", short: "C", href: "layout-c.html", title: "C 選股漏斗（策略篩選＋個股抽屜）" },
  ];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // 目前在哪一頁（Cloudflare 會把 /layout-a.html 變成 /layout-a，"/" 是主頁）
  const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
  const current = page === "index" ? "home" : (/^layout-([abc])$/.exec(page) || [])[1] || null;
  if (current && current !== "home") store.set("sd.layout", current);

  // 目前狀態：頁面自己設定的 > 網址參數 > 個股頁的代號／大盤頁的 #tw #us
  function state() {
    const q = new URLSearchParams(location.search);
    const s = Object.assign({}, window.SD_STATE || {});
    if (!s.market) {
      const m = q.get("market") || q.get("m");
      if (m === "tw" || m === "us" || m === "both") s.market = m;
      else if ((page === "market" || page === "watchlist") && /^#(tw|us)$/.test(location.hash)) s.market = location.hash.slice(1);
    }
    if (!s.symbol && q.get("symbol")) s.symbol = q.get("symbol").trim().toUpperCase();
    return s;
  }
  function hrefOf(L) {
    if (L.key === "home") return "index.html?home=1";
    const s = state(), q = new URLSearchParams();
    if (s.market) q.set("market", s.market);
    if (s.symbol) q.set("symbol", s.symbol);
    return L.href + (q.toString() ? "?" + q : "");
  }

  function mount() {
    const header = document.querySelector(".topbar");
    if (!header || header.querySelector(".layout-switch")) return;
    const nav = document.createElement("div");  // 不用 <nav>：頁首的 nav 被 CSS 藏起來（搜尋框以它定位）
    nav.className = "seg layout-switch";
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "版面切換");
    nav.innerHTML = LAYOUTS.map((L) =>
      '<a href="' + hrefOf(L) + '" data-l="' + L.key + '" title="' + L.title + '"' + (L.key === current ? ' aria-current="page"' : "") + ">" +
        '<span class="ls-long">' + L.label + '</span><span class="ls-short" aria-hidden="true">' + L.short + "</span></a>").join("");
    // 點的當下再算一次網址（頁面可能已經換了股票或市場）
    nav.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-l]");
      if (a) a.href = hrefOf(LAYOUTS.find((L) => L.key === a.dataset.l));
    });
    const theme = header.querySelector(".theme-btn");
    if (theme) header.insertBefore(nav, theme); else header.appendChild(nav);
  }

  // g h／g a／g b／g c
  let gAt = 0;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const k = (e.key || "").toLowerCase();
    if (k === "g") { gAt = Date.now(); return; }
    if (Date.now() - gAt > 1200) return;
    gAt = 0;
    const L = LAYOUTS.find((x) => (k === "h" ? x.key === "home" : x.key === k));
    if (L) location.href = hrefOf(L);
  });

  window.LayoutSwitch = {
    LAYOUTS, current, store,
    setState(s) { window.SD_STATE = Object.assign({}, window.SD_STATE || {}, s); },
    hrefOf: (key) => hrefOf(LAYOUTS.find((L) => L.key === key)),
    mount,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
