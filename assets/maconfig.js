// 「⚙ 設定」對話框：副圖一、副圖二的技術指標；K 線均線、均量線的天數、顏色、粗細、開關，可新增、刪除、恢復預設。
// 均線存在瀏覽器（Charts.saveMaSettings），副圖由頁面存（kline-opts-v2.subs），個股頁和大盤頁共用。
// MaConfig.open(subs, onSave)：subs 是 ["vol", 副圖一, 副圖二]；存檔後呼叫 onSave(新的 subs) 讓頁面重畫
(function () {
  const MAX = 8;
  let dlg = null, work = null, done = null, subs = null;

  function subsHtml() {
    return "<tr><td>成交量（K 線下方）</td><td>" + '<select data-subi="0" aria-label="K 線下方的成交量">' +
        [["vol", "顯示"], ["none", "不顯示"]].map(([k, t]) => '<option value="' + k + '"' + (subs[0] === k ? " selected" : "") + ">" + t + "</option>").join("") +
      "</select></td></tr>" +
      ["副圖一", "副圖二"].map((name, j) =>
      "<tr><td>" + name + '</td><td><select data-subi="' + (j + 1) + '" aria-label="' + name + '指標">' +
        Charts.SUB_TYPES.map(([k, t]) => '<option value="' + k + '"' + (subs[j + 1] === k ? " selected" : "") + ">" + t + "</option>").join("") +
      "</select></td></tr>").join("");
  }

  function rowsHtml(kind) {
    return work[kind].map((m, i) =>
      '<tr data-kind="' + kind + '" data-i="' + i + '">' +
        '<td><input type="checkbox" data-f="on"' + (m.on ? " checked" : "") + ' aria-label="顯示"></td>' +
        '<td><input type="number" data-f="n" min="2" max="500" step="1" value="' + m.n + '" aria-label="天數"> ' + (kind === "ma" ? "日" : "日均量") + "</td>" +
        '<td><input type="color" data-f="color" value="' + m.color + '" aria-label="顏色"></td>' +
        '<td><select data-f="width" aria-label="粗細">' + [1, 2, 3, 4].map((w) => '<option value="' + w + '"' + (m.width === w ? " selected" : "") + ">" + w + " 粗</option>").join("") + "</select></td>" +
        '<td><button type="button" class="rm-row" data-act="del" aria-label="刪除" title="刪除">×</button></td>' +
      "</tr>").join("");
  }

  function render() {
    dlg.querySelector('[data-list="subs"]').innerHTML = subsHtml();
    dlg.querySelector('[data-list="ma"]').innerHTML = rowsHtml("ma");
    dlg.querySelector('[data-list="vol"]').innerHTML = rowsHtml("vol");
    dlg.querySelectorAll("[data-add]").forEach((b) => { b.disabled = work[b.dataset.add].length >= MAX; });
    dlg.querySelector(".ma-err").textContent = "";
  }

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "ma-dlg";
    dlg.setAttribute("aria-labelledby", "ma-dlg-title");
    dlg.innerHTML =
      '<form method="dialog" class="dlg">' +
        '<h3 id="ma-dlg-title">設定</h3>' +
        '<h4>K 線下方的圖</h4><table class="ma-tbl"><tbody data-list="subs"></tbody></table>' +
        '<h4>K 線均線</h4><table class="ma-tbl"><thead><tr><th>顯示</th><th>天數</th><th>顏色</th><th>粗細</th><th></th></tr></thead><tbody data-list="ma"></tbody></table>' +
        '<button type="button" class="btn" data-add="ma">＋ 新增均線</button>' +
        '<h4>均量線（成交量）</h4><table class="ma-tbl"><thead><tr><th>顯示</th><th>天數</th><th>顏色</th><th>粗細</th><th></th></tr></thead><tbody data-list="vol"></tbody></table>' +
        '<button type="button" class="btn" data-add="vol">＋ 新增均量線</button>' +
        '<p class="ma-err down" role="alert"></p>' +
        '<p class="note" style="padding:0">分鐘、週、月線的「日」就是「根」。扣抵、資訊小框、圖例都會跟著用這些均線。副圖和均線設定個股頁、大盤頁共用。</p>' +
        '<div class="dlg-foot"><button type="button" class="btn" data-act="reset">恢復預設</button><span style="flex:1"></span>' +
          '<button type="button" class="btn" data-act="cancel">取消</button> <button type="button" class="btn primary" data-act="save">儲存</button></div>' +
      "</form>";
    document.body.appendChild(dlg);

    // 欄位變更直接寫回 work
    dlg.addEventListener("input", (e) => {
      if (e.target.dataset.subi != null) { subs[+e.target.dataset.subi] = e.target.value; return; }
      const tr = e.target.closest("tr[data-kind]");
      if (!tr) return;
      const m = work[tr.dataset.kind][+tr.dataset.i], f = e.target.dataset.f;
      if (f === "on") m.on = e.target.checked;
      else if (f === "n") m.n = parseInt(e.target.value, 10);
      else if (f === "color") m.color = e.target.value;
      else if (f === "width") m.width = +e.target.value;
    });
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.add) {
        const list = work[b.dataset.add];
        const used = new Set(list.map((x) => x.n));
        let n = 10;
        while (used.has(n)) n += 5;
        const colors = ["#f76707", "#0ca678", "#f783ac", "#845ef7", "#868e96", "#a0522d"];
        list.push({ n, color: colors[list.length % colors.length], width: 1, on: true });
        render();
      } else if (b.dataset.act === "del") {
        const tr = b.closest("tr");
        work[tr.dataset.kind].splice(+tr.dataset.i, 1);
        render();
      } else if (b.dataset.act === "reset") {
        work = JSON.parse(JSON.stringify(Charts.DEFAULT_MA));
        subs = Charts.subsOf({});
        render();
      } else if (b.dataset.act === "cancel") {
        dlg.close();
      } else if (b.dataset.act === "save") {
        const err = check();
        if (err) { dlg.querySelector(".ma-err").textContent = err; return; }
        work.ma.sort((a, b2) => a.n - b2.n);
        work.vol.sort((a, b2) => a.n - b2.n);
        Charts.saveMaSettings(work);
        dlg.close();
        if (done) done(subs.slice());
      }
    });
  }

  function check() {
    for (const [kind, name] of [["ma", "均線"], ["vol", "均量線"]]) {
      const seen = new Set();
      for (const m of work[kind]) {
        if (!Number.isInteger(m.n) || m.n < 2 || m.n > 500) return name + "天數要是 2～500 的整數";
        if (seen.has(m.n)) return name + "有重複的天數（" + m.n + "）";
        seen.add(m.n);
      }
    }
    return "";
  }

  function open(curSubs, onSave) {
    if (!dlg) build();
    done = onSave;
    subs = Charts.subsOf({ subs: curSubs });
    work = JSON.parse(JSON.stringify(Charts.maSettings()));
    render();
    dlg.showModal();
  }

  window.MaConfig = { open };
})();
