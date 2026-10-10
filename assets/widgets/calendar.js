// 區塊：本週行事曆（法說、除息、財報、總經）。資料 data/calendar.json 還沒有（LAYOUT-SPEC 第 7 步產生），
// 沒有時只列出確定的固定事件（每月 10 日前公布月營收），並註明資料待補，不放假資料。
// calendar.json 格式（預計）：{ updated, events: [{ date: "2026-10-12", type: "除息"|"法說"|"財報"|"總經", title, code? }] }
(function () {
  const TYPES = { "除息": "📅", "法說": "🎤", "財報": "📊", "總經": "🌐", "營收": "🧾" };
  Widgets.register("calendar", (el, o) => {
    el.classList.add("w-cal");
    (async () => {
      const head = o.title === false ? "" : '<div class="w-head"><h3>本週行事曆</h3></div>';
      const now = new Date(Date.now() + 8 * 3600e3), today = now.toISOString().slice(0, 10);
      const end = new Date(now.getTime() + 7 * 86400e3).toISOString().slice(0, 10);
      let evs = null, upd = "";
      try { const c = await Data.json("data/calendar.json"); evs = c.events || []; upd = c.updated || ""; } catch (e) {}
      if (evs) {
        const list = evs.filter((x) => x.date >= today && x.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
        el.innerHTML = head + (list.length ? '<ul class="cal-list">' + list.map((x) =>
          "<li><b>" + x.date.slice(5) + "</b> " + (TYPES[x.type] || "•") + " " + App.esc(x.title) + (x.code ? ' <a href="stock.html?symbol=' + encodeURIComponent(x.code) + '">' + App.esc(x.code) + "</a>" : "") + "</li>").join("") + "</ul>"
          : '<p class="note">— 這 7 天沒有事件</p>') + '<p class="updated">資料 ' + App.esc(upd) + "</p>";
        return;
      }
      const d = now.getUTCDate();
      el.innerHTML = head + '<ul class="cal-list">' +
        (d <= 10 ? "<li><b>" + now.toISOString().slice(5, 8) + "10</b> 🧾 上市櫃公司公布上月營收截止</li>" : "") +
        '</ul><p class="note">— 法說會、除權息、財報、總經行事曆資料待補（data/calendar.json，LAYOUT-SPEC 第 7 步）。</p>';
    })();
  });
})();
