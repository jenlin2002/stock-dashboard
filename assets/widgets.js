// TradingView 免費嵌入式 Widget 產生函式
// 嵌入方式：容器 div ＋ <script src="embed-widget-xxx.js">，設定以 JSON 寫在 script 內容裡。
(function () {
  const BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";
  const LOCALE = "zh_TW";

  // 代號轉換：上市 TWSE:2330、上櫃 TPEX:6488、美股 NASDAQ:AAPL / NYSE:XXX
  function tvSymbol(item) {
    if (item.code) return (item.market === "TPEX" ? "TPEX" : "TWSE") + ":" + item.code;
    return (item.exchange || "NASDAQ") + ":" + item.ticker;
  }

  // TradingView 免費 Widget 不提供上市（TWSE）股價（只顯示「此商品僅在TradingView上可用」），
  // 上櫃（TPEX）和美股正常；基本面、公司簡介則上市也有。iframe 內容讀不到，所以依市場判斷。
  function hasPrice(item) {
    return !(item.code && item.market !== "TPEX");
  }

  function showPriceBlocked(host, symbol) {
    host.innerHTML =
      '<div class="nodata">TradingView 不開放上市股票的嵌入報價／K 線' +
      '<br><a href="https://www.tradingview.com/symbols/' + symbol.replace(":", "-") +
      '/" target="_blank" rel="noopener">在 TradingView 開啟</a></div>';
  }

  function theme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function showNoData(host, symbol) {
    host.innerHTML =
      '<div class="nodata">此項目無資料' +
      (symbol ? '<br><a href="https://www.tradingview.com/symbols/' +
        symbol.replace(":", "-") + '/" target="_blank" rel="noopener">在 TradingView 開啟</a>' : "") +
      "</div>";
  }

  // 在 host 裡放一個 widget；載入失敗或逾時沒有產生 iframe 時顯示「此項目無資料」
  function mount(host, name, config, symbol) {
    host.innerHTML = "";
    const box = document.createElement("div");
    box.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    box.appendChild(inner);
    const s = document.createElement("script");
    s.src = BASE + name + ".js";
    s.async = true;
    s.textContent = JSON.stringify(Object.assign({ locale: LOCALE, colorTheme: theme(), isTransparent: true }, config));
    s.onerror = () => showNoData(host, symbol);
    box.appendChild(s);
    host.appendChild(box);
    setTimeout(() => { if (!host.querySelector("iframe")) showNoData(host, symbol); }, 15000);
  }

  // 主題跟隨系統：切換時重畫所有 widget
  const renderers = [];
  function register(fn) { renderers.push(fn); fn(); }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderers.forEach((fn) => fn()));

  // TradingView 完整圖表頁（用本人的登入、付費功能和自訂指標）
  function chartUrl(item) {
    return "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(tvSymbol(item));
  }

  window.TV = {
    tvSymbol,
    hasPrice,
    chartUrl,
    tickerTape(host, items) {
      register(() => mount(host, "ticker-tape", {
        symbols: items.filter(hasPrice).map((it) => ({ proName: tvSymbol(it), title: it.name })),
        showSymbolLogo: true,
        displayMode: "adaptive",
      }));
    },
    miniOverview(host, item) {
      const sym = tvSymbol(item);
      if (!hasPrice(item)) return showPriceBlocked(host, sym);
      register(() => mount(host, "mini-symbol-overview", {
        symbol: sym, width: "100%", height: "100%", dateRange: "12M", autosize: true, chartOnly: false,
      }, sym));
    },
    symbolInfo(host, item) {
      const sym = tvSymbol(item);
      if (!hasPrice(item)) return showPriceBlocked(host, sym);
      register(() => mount(host, "symbol-info", { symbol: sym, width: "100%" }, sym));
    },
    advancedChart(host, item) {
      const sym = tvSymbol(item);
      if (!hasPrice(item)) return showPriceBlocked(host, sym);
      register(() => mount(host, "advanced-chart", {
        symbol: sym, autosize: true, interval: "D", timezone: "Asia/Taipei", style: "1",
        theme: theme(), allow_symbol_change: false, hide_side_toolbar: false,
        support_host: "https://www.tradingview.com",
      }, sym));
    },
    fundamentals(host, item) {
      const sym = tvSymbol(item);
      register(() => mount(host, "financials", {
        symbol: sym, displayMode: "regular", width: "100%", height: "100%",
      }, sym));
    },
    profile(host, item) {
      const sym = tvSymbol(item);
      register(() => mount(host, "symbol-profile", { symbol: sym, width: "100%", height: "100%" }, sym));
    },
  };
})();
