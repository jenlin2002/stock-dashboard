// 熱力圖（treemap）：方塊大小＝市值、顏色＝漲跌（紅漲綠跌）、依產業分區。
// 版面用 squarified treemap 演算法（Bruls 等人），讓方塊盡量接近正方形，文字才放得下。
// Heatmap.render(host, groups, opts)
//   groups：[{ name, items: [{ label, sub, value, pct, href, title }] }]
//   opts.range：顏色飽和的漲跌幅（%），例如台股 5、美股 3
(function () {
  const sum = (a) => a.reduce((s, x) => s + x.value, 0);

  // 把 items（value 由大到小）排進矩形，回傳每個的 {item, x, y, w, h}
  function squarify(items, x, y, w, h) {
    const out = [];
    let rest = items.filter((it) => it.value > 0);
    const total = sum(rest);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total;  // 每單位 value 的面積
    const worst = (row, side) => {
      const s = sum(row) * scale;
      const max = row[0].value * scale, min = row[row.length - 1].value * scale;
      return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
    };
    while (rest.length) {
      const side = Math.min(w, h);
      let row = [rest[0]], best = worst(row, side), i = 1;
      while (i < rest.length) {
        const next = row.concat(rest[i]);
        const r = worst(next, side);
        if (r > best) break;
        row = next; best = r; i++;
      }
      rest = rest.slice(row.length);
      const rowArea = sum(row) * scale;
      if (w >= h) {  // 沿左邊排一欄
        const cw = rowArea / h;
        let cy = y;
        row.forEach((it) => { const ih = (it.value * scale) / cw; out.push({ item: it, x, y: cy, w: cw, h: ih }); cy += ih; });
        x += cw; w -= cw;
      } else {       // 沿上邊排一列
        const rh = rowArea / w;
        let cx = x;
        row.forEach((it) => { const iw = (it.value * scale) / rh; out.push({ item: it, x: cx, y, w: iw, h: rh }); cx += iw; });
        y += rh; h -= rh;
      }
    }
    return out;
  }

  // 顏色：0% 灰、往上越紅、往下越綠（不跟深淺色主題變，熱力圖慣例用深底白字）
  const NEUTRAL = [66, 70, 79], UP = [220, 48, 56], DOWN = [24, 150, 82];
  function color(pct, range) {
    if (pct == null || isNaN(pct)) return "rgb(" + NEUTRAL + ")";
    const t = Math.min(1, Math.abs(pct) / range), to = pct > 0 ? UP : DOWN;
    return "rgb(" + NEUTRAL.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",") + ")";
  }

  function esc(s) { return App.esc(s); }

  function render(host, groups, opts) {
    const range = (opts && opts.range) || 3;
    const W = host.clientWidth, H = host.clientHeight;
    groups = groups.map((g) => Object.assign({}, g, { value: sum(g.items), items: g.items.slice().sort((a, b) => b.value - a.value) }))
      .filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
    let html = "";
    squarify(groups, 0, 0, W, H).forEach(({ item: g, x, y, w, h }) => {
      const head = g.name && w > 60 && h > 40 ? 16 : 0;  // 產業名稱列（沒有名稱就不留）
      html += '<div class="hm-group" style="left:' + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + 'px">' +
        (head ? '<div class="hm-gname">' + esc(g.name) + "</div>" : "");
      squarify(g.items, 1, head + 1, w - 2, h - head - 2).forEach(({ item: it, x: ix, y: iy, w: iw, h: ih }) => {
        const big = iw > 46 && ih > 28;
        const fs = Math.max(10, Math.min(22, Math.sqrt(iw * ih) / 5));
        // 有 key 的方塊（類股）由頁面處理點擊；沒有的直接連到 href（個股頁）
        html += '<a class="hm-tile" href="' + esc(it.href || "#") + '"' + (it.key ? ' data-key="' + esc(it.key) + '"' : "") + ' title="' + esc(it.title) + '" style="left:' + ix + "px;top:" + iy + "px;width:" + iw + "px;height:" + ih +
          "px;background:" + color(it.pct, range) + ";font-size:" + fs.toFixed(1) + 'px">' +
          (big ? "<b>" + esc(it.label) + "</b>" + (ih > fs * 2.6 ? "<span>" + (it.pct > 0 ? "+" : "") + (it.pct == null ? "—" : it.pct.toFixed(2) + "%") + "</span>" : "") : "") + "</a>";
      });
      html += "</div>";
    });
    host.innerHTML = html;
  }

  // 圖例：-range … +range
  function legend(range) {
    const steps = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
    return steps.map((t) => '<span style="background:' + color(t * range, range) + '">' + (t > 0 ? "+" : "") + (t * range).toFixed(t === 0 ? 0 : 1) + "%</span>").join("");
  }

  window.Heatmap = { render, legend, color };
})();
