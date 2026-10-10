// 股票選擇框（B、C 版「目前個股」）：輸入代號或名稱，台股美股都找得到；選了就呼叫 onPick({ market, symbol, name })。
// StockPicker.attach(input, onPick)
(function () {
  function attach(input, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "search picker";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.setAttribute("role", "combobox");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-expanded", "false");
    const list = document.createElement("ul");
    list.setAttribute("role", "listbox");
    list.hidden = true;
    wrap.appendChild(list);
    let res = [], act = -1, timer;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); res = []; act = -1; };
    const render = () => {
      list.innerHTML = res.length ? res.map((r, i) => '<li role="option" data-i="' + i + '"' + (i === act ? ' aria-selected="true"' : "") + "><b>" + App.esc(r.symbol) + "</b> " + App.esc(r.name) + " <span>" + (r.m === "us" ? "美股・" : "") + App.esc(r.tag) + "</span></li>").join("") : '<li class="empty">找不到</li>';
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    const pick = (r) => { if (!r) return; input.value = ""; input.placeholder = r.symbol + " " + r.name; close(); onPick({ market: r.m, symbol: r.symbol, name: r.name }); };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const v = input.value.trim();
        if (!v) return close();
        res = await App.searchStocks(v, 8).catch(() => []);
        if (input.value.trim() !== v) return;
        act = res.length ? 0 : -1;
        render();
      }, 120);
    });
    input.addEventListener("focus", () => App.loadStockList().catch(() => {}));
    input.addEventListener("keydown", (e) => {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && res.length) { e.preventDefault(); act = (act + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; render(); }
      else if (e.key === "Enter") { e.preventDefault(); pick(res[act]); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); pick(res[+li.dataset.i]); } });
    input.addEventListener("blur", () => setTimeout(close, 150));
  }
  window.StockPicker = { attach };
})();
