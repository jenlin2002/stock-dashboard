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

  async function update() {
    const q = input.value.trim();
    if (!q) return close();
    let out;
    try { out = await App.searchStocks(q, 10); } catch (e) { return close(); }
    if (input.value.trim() !== q) return;  // 使用者又打了字
    results = out;
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
