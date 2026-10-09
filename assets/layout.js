// 共用版面：左側選單（大項目＋細項）＋右側內容。每頁在 app.js 之後載入即可。
// 手機（窄螢幕）時選單收起，按頁首「☰」打開。
(function () {
  // ready：false 表示頁面還沒做，顯示「建置中」
  const lastSymbol = (() => { try { return localStorage.getItem("last-symbol") || "2330"; } catch (e) { return "2330"; } })();
  const MENU = [
    { icon: "📈", label: "大盤", href: "market.html", ready: false, subs: [["加權指數", "#index"], ["法人買賣超", "#inst"], ["融資融券", "#margin"]] },
    { icon: "💰", label: "類股資金流向", href: "flow.html", ready: false, subs: [["類股成交比重", "#share"], ["法人進出排行", "#rank"]] },
    { icon: "📋", label: "全台股總表", href: "all.html", ready: true, subs: [["依股號", "all.html"], ["依產業", "all.html?view=industry"]] },
    { icon: "🔍", label: "個股分析", href: "stock.html?symbol=" + encodeURIComponent(lastSymbol), page: "stock", ready: true,
      subs: [["PEG 評分卡", "#p-refs"], ["K 線・指標", "#p-kline"], ["月營收", "#p-revenue"], ["季度財報", "#p-quarterly"], ["股利", "#p-div"]] },
    { icon: "⭐", label: "我的追蹤", href: "index.html", ready: true, subs: [["追蹤清單", "index.html"], ["比較表", "compare.html"]] },
  ];

  // 目前在哪一頁（Cloudflare 會把 /stock.html 變成 /stock，"/" 是首頁）
  const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
  const pageOf = (href) => href.split(/[?#]/)[0].replace(/\.html$/, "") || page;
  // 細項是否就是目前頁面：頁名＋查詢字串都相同（all.html 與 all.html?view=industry 分得開）
  const keyOf = (href) => pageOf(href) + (href.includes("?") ? "?" + href.split("?")[1].split("#")[0] : "");
  const curKey = page + location.search;

  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.setAttribute("aria-label", "主選單");
  aside.innerHTML = "<nav>" + MENU.map((g) => {
    const active = pageOf(g.href) === page || (g.subs || []).some(([, h]) => !h.startsWith("#") && pageOf(h) === page);
    if (!g.ready) {
      return '<div class="grp off"><span class="big"><i>' + g.icon + "</i>" + g.label + '<em>建置中</em></span></div>';
    }
    const subs = (g.subs || []).map(([t, h]) => {
      // 「#」開頭的細項是本頁錨點，只有在該頁時才連到錨點，否則先進該頁
      const href = h.startsWith("#") ? (active ? h : g.href + h) : h;
      const cur = !h.startsWith("#") && keyOf(h) === curKey;
      return '<a class="sub' + (cur ? " cur" : "") + '" href="' + href + '">' + t + "</a>";
    }).join("");
    return '<div class="grp' + (active ? " on" : "") + '"><a class="big" href="' + g.href + '"><i>' + g.icon + "</i>" + g.label + "</a>" + subs + "</div>";
  }).join("") + "</nav>";

  // 把頁首以下的內容（跑馬燈、main、footer）包進右側
  const header = document.querySelector(".topbar");
  const layout = document.createElement("div");
  layout.className = "layout";
  const content = document.createElement("div");
  content.className = "content";
  let n = header.nextElementSibling;
  while (n && n.tagName !== "SCRIPT") {
    const next = n.nextElementSibling;
    content.appendChild(n);
    n = next;
  }
  layout.appendChild(aside);
  layout.appendChild(content);
  header.after(layout);

  // 手機：☰ 開關選單，點選單外面或選項後關閉
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-btn";
  btn.setAttribute("aria-label", "選單");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "☰";
  header.insertBefore(btn, header.firstChild);
  const setOpen = (open) => {
    document.body.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(!document.body.classList.contains("menu-open")));

  // 深色／淺色切換（頁首最右邊）
  const tb = document.createElement("button");
  tb.type = "button";
  tb.className = "theme-btn";
  const paint = () => {
    const dark = App.isDark();
    tb.textContent = dark ? "☀️" : "🌙";
    tb.title = tb.ariaLabel = dark ? "切換成淺色" : "切換成深色";
  };
  tb.addEventListener("click", () => App.setTheme(App.isDark() ? "light" : "dark"));
  App.onThemeChange(paint);
  paint();
  header.appendChild(tb);
  layout.addEventListener("click", (e) => {
    if (!document.body.classList.contains("menu-open")) return;
    if (!aside.contains(e.target) || e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
})();
