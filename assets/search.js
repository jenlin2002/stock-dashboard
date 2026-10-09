// 頁首搜尋框：輸入代號或名稱（2454、聯發科、TSLA、tesla），從 data/stocklist.json 找出建議，選了就進個股頁
(function () {
  const nav = document.querySelector(".topbar nav");
  if (!nav) return;
  const box = document.createElement("div");
  box.className = "search";
  box.innerHTML =
    '<input type="search" placeholder="查股票：代號或名稱" aria-label="查股票：代號或名稱" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="search-list">' +
    '<ul id="search-list" role="listbox" hidden></ul>';
  nav.parentNode.insertBefore(box, nav);
  const input = box.querySelector("input"), list = box.querySelector("ul");
  let results = [], active = -1;

  function score(q, code, name) {
    const c = code.toUpperCase(), n = name.toUpperCase();
    if (c === q) return 0;
    if (c.startsWith(q)) return 1;
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 3;
    return -1;
  }

  async function update() {
    const q = input.value.trim().toUpperCase();
    if (!q) return close();
    let s;
    try { s = await App.loadStockList(); } catch (e) { return close(); }
    if (input.value.trim().toUpperCase() !== q) return;  // 使用者又打了字
    const out = [];
    for (const [code, name, market, industry] of s.tw) {
      const sc = score(q, code, name);
      if (sc >= 0) out.push({ sc, symbol: code, name, tag: (market === "TWSE" ? "上市" : "上櫃") + (industry ? "・" + industry : ""), m: "tw" });
    }
    for (const [ticker, name, exch] of s.us) {
      const sc = score(q, ticker, name);
      if (sc >= 0) out.push({ sc, symbol: ticker, name, tag: exch, m: "us" });
    }
    out.sort((a, b) => a.sc - b.sc || a.symbol.length - b.symbol.length || (a.symbol < b.symbol ? -1 : 1));
    results = out.slice(0, 10);
    active = results.length ? 0 : -1;
    render();
  }

  function render() {
    if (!results.length) {
      list.innerHTML = '<li class="empty">找不到，按 Enter 直接查這個代號</li>';
    } else {
      list.innerHTML = results.map((r, i) =>
        '<li role="option" data-i="' + i + '"' + (i === active ? ' aria-selected="true"' : "") + "><b>" + App.esc(r.symbol) + "</b> " + App.esc(r.name) + ' <span>' + App.esc(r.tag) + "</span></li>").join("");
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    results = []; active = -1;
  }

  function go(r) {
    if (r) location.href = "stock.html?symbol=" + encodeURIComponent(r.symbol) + "&m=" + r.m;
    else if (input.value.trim()) location.href = "stock.html?symbol=" + encodeURIComponent(input.value.trim().toUpperCase());
  }

  let timer;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 120); });
  input.addEventListener("focus", () => { App.loadStockList().catch(() => {}); if (input.value.trim()) update(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      close();
    }
  });
  list.addEventListener("mousedown", (e) => {  // mousedown：在 input 失去焦點前處理
    const li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); go(results[+li.dataset.i]); }
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
})();
