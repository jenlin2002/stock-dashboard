// 區塊掛載（LAYOUT-SPEC.md 的 mount.js）：版面頁只放容器，例如
//   <section data-widget="heatmap" data-market="tw"></section>
// Widgets.mount(root, ctx) 掃描 [data-widget]，呼叫對應的區塊：render(el, 參數)。
// 參數＝ctx（版面頁共用的，例如目前市場、股票）＋容器的 data-*（容器的優先）。
// render 可以回傳 { update(參數), destroy() }，存在 el._widget，版面頁換股票時呼叫 update。
(function () {
  const reg = {};
  function parse(v) { return v === "true" ? true : v === "false" ? false : v; }
  window.Widgets = {
    register(name, render) { reg[name] = render; },
    has: (name) => !!reg[name],
    render(el, name, opts) {
      if (!reg[name]) { el.innerHTML = '<p class="note">沒有這個區塊：' + App.esc(name) + "</p>"; return null; }
      if (el._widget && el._widget.destroy) el._widget.destroy();
      try { el._widget = reg[name](el, opts || {}) || null; }
      catch (e) { console.error(e); el.innerHTML = '<p class="note">這個區塊出錯了：' + App.esc(e.message) + "</p>"; el._widget = null; }
      return el._widget;
    },
    mount(root, ctx) {
      (root || document).querySelectorAll("[data-widget]").forEach((el) => {
        const opts = Object.assign({}, ctx || {});
        for (const [k, v] of Object.entries(el.dataset)) if (k !== "widget") opts[k] = parse(v);
        Widgets.render(el, el.dataset.widget, opts);
      });
    },
    // 版面頁換市場、股票時，通知所有已掛載的區塊
    update(root, ctx) {
      (root || document).querySelectorAll("[data-widget]").forEach((el) => {
        if (el._widget && el._widget.update) el._widget.update(Object.assign({}, ctx));
      });
    },
  };
})();
