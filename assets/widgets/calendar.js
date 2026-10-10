// 區塊：行事曆（除權息、法說會、營收、財報截止、台指期結算、FOMC）。資料 data/calendar.json（scripts/build_calendar.py，每天台股收盤後更新）。
// 追蹤清單、自選股、庫存股裡的股票標 ★ 並排在同一天的最前面。
// 參數：days 顯示今天起幾天（預設 7）、max 最多幾筆（預設 15，其餘可展開）、mine "true"＝只看我追蹤的、title（false＝不顯示）
(function () {
  const ICON = { "除息": "💰", "法說": "🎤", "財報": "📊", "營收": "🧾", "期貨": "📈", "總經": "🌐" };
  Widgets.register("calendar", (el, o) => {
    el.classList.add("w-cal");
    const days = +o.days || 7, max = +o.max || 15;
    let mineOnly = o.mine === true, showAll = false;
    async function draw() {
      const head = o.title === false ? "" : '<div class="w-head"><h3>' + (days <= 7 ? "本週行事曆" : "未來 " + days + " 天行事曆") + '</h3><label class="updated cal-mine"><input type="checkbox" data-mine' + (mineOnly ? " checked" : "") + "> 只看我追蹤的</label></div>";
      let c;
      try { c = await Data.json("data/calendar.json"); } catch (e) {
        el.innerHTML = head + '<p class="note">— 讀不到行事曆（data/calendar.json，排程每天台股收盤後產生）</p>';
        return;
      }
      // 我追蹤的：追蹤清單＋自選股分頁＋庫存股
      const mine = new Set();
      try { const w = await Data.watchlist(); w.tw.forEach((x) => mine.add(x.code)); } catch (e) {}
      try { (await Data.groups()).forEach((g) => g.items.forEach((k) => { if (k.startsWith("tw:")) mine.add(k.slice(3)); })); } catch (e) {}
      try { Object.keys(Holdings.load().tw).forEach((k) => mine.add(k)); } catch (e) {}
      const now = new Date(Date.now() + 8 * 3600e3), today = now.toISOString().slice(0, 10);
      const end = new Date(now.getTime() + days * 86400e3).toISOString().slice(0, 10);
      let list = (c.events || []).filter((x) => x.date >= today && x.date <= end && (!mineOnly || !x.code || mine.has(x.code)));
      list.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (mine.has(b.code) ? 1 : 0) - (mine.has(a.code) ? 1 : 0)));
      const shown = showAll ? list : list.slice(0, max);
      const wd = "日一二三四五六";
      el.innerHTML = head + (list.length ? '<ul class="cal-list">' + shown.map((x) => {
        const star = x.code && mine.has(x.code);
        return '<li class="' + (star ? "mine" : "") + '"><b>' + x.date.slice(5) + "（" + wd[new Date(x.date).getUTCDay()] + "）</b> " + (ICON[x.type] || "•") + " " +
          (star ? "★ " : "") + (x.code ? '<a href="stock.html?symbol=' + encodeURIComponent(x.code) + '">' + App.esc(x.title) + "</a>" : App.esc(x.title)) + "</li>";
      }).join("") + "</ul>" : '<p class="note">— 這段期間沒有' + (mineOnly ? "你追蹤的股票的" : "") + "事件</p>") +
        (list.length > shown.length ? '<button type="button" class="btn cal-more" data-act="all">再顯示 ' + (list.length - shown.length) + " 筆</button>" : "") +
        '<p class="updated">資料 ' + App.esc(c.updated || "") + "・除權息、法說會只列上市櫃普通股</p>";
    }
    el.addEventListener("change", (e) => { if (e.target.matches("[data-mine]")) { mineOnly = e.target.checked; draw(); } });
    el.addEventListener("click", (e) => { if (e.target.closest('[data-act="all"]')) { showAll = true; draw(); } });
    window.addEventListener("sd:groups", draw);
    draw();
    return { destroy() { window.removeEventListener("sd:groups", draw); } };
  });
})();
