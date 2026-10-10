// 持股（庫存）：從券商匯出的資料匯入，只存在這台裝置的瀏覽器（localStorage "holdings-v1"），不上傳 GitHub。
// 可以匯入：貼上的文字（YesWin／XQ 表格複製、或自己打「代號 股數 均價」）、CSV／TXT（UTF-8 或 Big5）、Excel、PDF（集保 e 手掌握）。
// 格式：{ tw: { "2330": { name, market, shares, cost } }, us: { "AAPL": { name, exchange, shares, cost } }, ts }
//   shares＝股數（台股也是「股」，不是張）；cost＝總成本（元／美元），不知道就是 null
(function (root) {
  const KEY = "holdings-v1";

  // ---------- 儲存 ----------
  function load() {
    try {
      const h = JSON.parse(root.localStorage.getItem(KEY) || "null");
      if (h && h.tw && h.us) return h;
    } catch (e) {}
    return { tw: {}, us: {}, ts: 0 };
  }
  function save(h) {
    h.ts = Date.now();
    root.localStorage.setItem(KEY, JSON.stringify(h));
  }
  function count(h, m) { return Object.keys(h[m] || {}).length; }

  // 市值、損益（未扣賣出手續費與交易稅）
  function calc(e, price) {
    const r = { avg: null, mv: null, pl: null, pct: null };
    if (!e || !(e.shares > 0)) return r;
    if (isNum(e.cost)) r.avg = e.cost / e.shares;
    if (isNum(price)) {
      r.mv = price * e.shares;
      if (isNum(e.cost) && e.cost > 0) { r.pl = r.mv - e.cost; r.pct = r.pl / e.cost * 100; }
    }
    return r;
  }

  // 備份成 CSV（可以在另一台電腦、手機的「匯入庫存」再匯入）
  function toCsv(h) {
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const lines = ["市場,代號,名稱,股數,總成本"];
    for (const m of ["tw", "us"]) {
      for (const [code, e] of Object.entries(h[m])) {
        lines.push([m === "tw" ? "台股" : "美股", q(code), q(e.name), e.shares, isNum(e.cost) ? round(e.cost, 4) : ""].join(","));
      }
    }
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  // ---------- 文字 → 表格 ----------
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function round(n, d) { const p = Math.pow(10, d); return Math.round(n * p) / p; }

  // 全形轉半形、去掉 Excel 的 ="2330" 寫法和前後引號
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　| /g, " ")
      .trim()
      .replace(/^="?(.*?)"?$/, "$1")
      .replace(/^"(.*)"$/, "$1")
      .trim();
  }

  // "1,000"、"$550.5"、"NT$ 1,234"、"(123)"、"1,000股" → 數字；不是數字回傳 null
  function toNum(s) {
    let t = norm(s).replace(/NT\$|US\$|USD|TWD|[$,\s元股]/gi, "");
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return neg ? -n : n;
  }

  function csvLine(line) {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  // 每行：有 Tab 用 Tab 切（從 YesWin／XQ／Excel 複製的表格）；CSV 檔用逗號；其他用空白
  // 空白切不出 3 欄、逗號切得出 3 欄以上的行，也當成 CSV（例：2330,台積電,1000,550）
  function textRows(text, isCsv) {
    const rows = [];
    for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) continue;
      let cells;
      if (line.includes("\t")) cells = line.split("\t");
      else if (isCsv) cells = csvLine(line);
      else {
        const ws = line.trim().split(/\s+/), cs = csvLine(line);
        cells = ws.length < 3 && cs.length >= 3 ? cs : ws;
      }
      rows.push(cells.map(norm));
    }
    return rows;
  }

  // ---------- 表格 → 持股 ----------
  const RE = {
    code: /代號|代碼|股號|股票代|商品代|證券代|^symbol$|^ticker$/i,
    name: /名稱|^商品$|^股票$|^證券$|^標的$|^name$|description/i,
    sharesFirst: /股數/,
    shares: /庫存|數量|持有|現股|餘額|^qty$|quantity|shares|position/i,
    notShares: /成本|價|金額|市值|損益|報酬|cost|price|value|gain|%/i,
    avg: /均價|平均成本|成本均價|平均價|成本價|單位成本|avg|average|pricepaid|costpershare|cost\/share/i,
    total: /付出成本|總成本|持有成本|成本金額|投資成本|買進成本|^成本$|costbasis|totalcost|^cost$/i,
    notTotal: /均|單位|價|share/i,
    skipRow: /合計|總計|小計|^total$/i,
  };

  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const cells = rows[i].map((c) => c.replace(/\s/g, ""));
      // 表頭不會有一堆數字
      if (cells.filter((c) => toNum(c) != null).length > 1) continue;
      const idx = (re, not) => cells.findIndex((c) => c && re.test(c) && !(not && not.test(c)));
      const col = {
        code: idx(RE.code),
        shares: idx(RE.sharesFirst, RE.notShares),
        avg: idx(RE.avg),
        total: idx(RE.total, RE.notTotal),
      };
      if (col.shares < 0) col.shares = idx(RE.shares, RE.notShares);
      col.name = cells.findIndex((c, j) => c && j !== col.code && RE.name.test(c) && !RE.code.test(c));
      if (col.shares >= 0 && (col.code >= 0 || col.name >= 0)) {
        col.lots = /張/.test(cells[col.shares]) && !/股/.test(cells[col.shares]);
        return { row: i, col };
      }
    }
    return null;
  }

  // 股票清單（data/stocklist.json）→ 查詢用的對照表
  function indexList(list) {
    const tw = new Map(), us = new Map(), twName = new Map();
    for (const [code, name, market] of list.tw || []) { tw.set(code, { m: "tw", code, name, market }); if (!twName.has(name)) twName.set(name, tw.get(code)); }
    for (const [ticker, name, exchange] of list.us || []) us.set(ticker, { m: "us", code: ticker, name, exchange });
    return { tw, us, twName };
  }

  // 一格裡找股票：台股代號（2330、00878、00631L）、美股代號（AAPL、NASDAQ:AAPL）、台股名稱
  function findInCell(cell, ix) {
    const c = norm(cell).toUpperCase();
    if (!c) return null;
    for (const m of c.matchAll(/(?:^|[^0-9A-Z])(\d{4,6}[A-Z]?)(?=$|[^0-9A-Z])/g)) {
      if (ix.tw.has(m[1])) return ix.tw.get(m[1]);
    }
    const toks = c.split(/[\s:()（）]+/).filter(Boolean);
    if (toks.length <= 2) {
      for (const t of toks) if (/^[A-Z][A-Z.\-]{0,5}$/.test(t) && ix.us.has(t)) return ix.us.get(t);
    }
    const n = norm(cell);
    if (ix.twName.has(n)) return ix.twName.get(n);
    // 「台積電(2330)」以外的寫法：名稱後面接空白或括號
    const head = n.split(/[\s(（]/)[0];
    if (head && ix.twName.has(head)) return ix.twName.get(head);
    return null;
  }

  // rows：二維文字陣列；list：data/stocklist.json
  // 回傳 { items: [{ m, code, name, market|exchange, shares, cost }], skipped: [{ text, why }], header }
  function parseRows(rows, list) {
    const ix = indexList(list);
    const hd = findHeader(rows);
    const found = [], skipped = [];
    const start = hd ? hd.row + 1 : 0;
    for (let i = start; i < rows.length; i++) {
      const cells = rows[i];
      const text = cells.filter(Boolean).join(" ");
      if (!text) continue;
      if (cells.some((c) => RE.skipRow.test(c.replace(/\s/g, "")))) continue;
      if (/融券/.test(text)) { skipped.push({ text, why: "融券（放空）不計入" }); continue; }

      let stock = null, shares = null, avg = null, total = null;
      if (hd) {
        const { col } = hd;
        if (col.code >= 0) stock = findInCell(cells[col.code], ix);
        if (!stock && col.name >= 0) stock = findInCell(cells[col.name], ix);
        if (!stock) for (const c of cells) { if ((stock = findInCell(c, ix))) break; }
        shares = toNum(cells[col.shares]);
        if (shares != null && col.lots) shares *= 1000;
        if (col.avg >= 0) avg = toNum(cells[col.avg]);
        if (col.total >= 0) total = toNum(cells[col.total]);
      } else {
        // 沒有表頭：找到股票的那一格之後，第一個數字是股數、第二個是成本均價
        let at = -1;
        for (let j = 0; j < cells.length; j++) {
          const hit = findInCell(cells[j], ix);
          // 純數字的格子只有在它是這行第一個數字時才當代號（避免把股數當代號）
          if (hit && (toNum(cells[j]) == null || cells.slice(0, j).every((c) => toNum(c) == null))) { stock = hit; at = j; break; }
        }
        if (stock) {
          const nums = cells.slice(at + 1).map(toNum).filter((n) => n != null);
          shares = nums[0] != null ? nums[0] : null;
          avg = nums[1] != null ? nums[1] : null;
        }
      }
      if (!stock) { skipped.push({ text, why: "找不到股票代號或名稱" }); continue; }
      if (!(shares > 0)) { skipped.push({ text, why: "沒有股數" }); continue; }
      let cost = null;
      if (total != null && total > 0) cost = total;
      else if (avg != null && avg > 0) cost = avg * shares;
      found.push({ stock, shares, cost });
    }

    // 同一檔出現多列（例：現股、融資分開列）就合併
    const byKey = new Map();
    for (const f of found) {
      const k = f.stock.m + ":" + f.stock.code;
      const prev = byKey.get(k);
      if (!prev) {
        const it = { m: f.stock.m, code: f.stock.code, name: f.stock.name, shares: f.shares, cost: f.cost };
        if (f.stock.m === "tw") it.market = f.stock.market; else it.exchange = f.stock.exchange;
        byKey.set(k, it);
      } else {
        prev.shares += f.shares;
        prev.cost = prev.cost != null && f.cost != null ? prev.cost + f.cost : null;
      }
    }
    const items = [...byKey.values()].map((it) => Object.assign(it, { shares: round(it.shares, 6), cost: it.cost == null ? null : round(it.cost, 4) }));
    items.sort((a, b) => (a.m === b.m ? (a.code < b.code ? -1 : 1) : a.m === "tw" ? -1 : 1));
    return { items, skipped, header: !!hd };
  }

  // 自選股清單匯入：只要股票（不需要股數）。每列取第一個認得的股票；純數字的格子只有在它是這列第一個數字時才當代號
  // 回傳 { items: [{ m, code, name, market|exchange }], skipped: [{ text, why }] }
  function parseList(rows, list) {
    const ix = indexList(list);
    const byKey = new Map(), skipped = [];
    for (const cells of rows) {
      const text = cells.filter(Boolean).join(" ");
      if (!text || cells.some((c) => RE.skipRow.test(c.replace(/\s/g, "")))) continue;
      let stock = null;
      for (let j = 0; j < cells.length && !stock; j++) {
        const hit = findInCell(cells[j], ix);
        if (hit && (toNum(cells[j]) == null || cells.slice(0, j).every((c) => toNum(c) == null))) stock = hit;
      }
      if (!stock) { if (cells.some((c) => /\d|[A-Z]/i.test(c))) skipped.push({ text, why: "找不到股票代號或名稱" }); continue; }
      const k = stock.m + ":" + stock.code;
      if (!byKey.has(k)) {
        const it = { m: stock.m, code: stock.code, name: stock.name };
        if (stock.m === "tw") it.market = stock.market; else it.exchange = stock.exchange;
        byKey.set(k, it);
      }
    }
    return { items: [...byKey.values()], skipped };
  }

  // ---------- 檔案 → 表格 ----------
  function loadScript(src, global) {
    if (root[global]) return Promise.resolve(root[global]);
    return new Promise((ok, fail) => {
      const sc = root.document.createElement("script");
      sc.src = src;
      sc.onload = () => ok(root[global]);
      sc.onerror = () => fail(new Error("元件載入失敗，請檢查網路"));
      root.document.head.appendChild(sc);
    });
  }

  // CSV／TXT：先試 UTF-8，不是就當 Big5（台灣券商常見）
  function decodeText(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("big5").decode(buf); }
  }

  async function excelRows(buf) {
    const X = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
    const wb = X.read(new Uint8Array(buf), { type: "array" });
    const rows = [];
    for (const name of wb.SheetNames) {
      const aoa = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
      for (const r of aoa) rows.push(r.map(norm));
    }
    return rows;
  }

  // PDF：同一高度的文字當一列，依左右位置排成格子
  async function pdfRows(buf) {
    const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    const lib = await loadScript(base + "pdf.min.js", "pdfjsLib");
    lib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
    // cMap：中文 CID 字型（台灣常見）要有字碼對照表才讀得出文字
    const doc = await lib.getDocument({ data: new Uint8Array(buf), cMapUrl: base + "cmaps/", cMapPacked: true, standardFontDataUrl: base + "standard_fonts/" }).promise;
    const rows = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const lines = [];
      for (const it of tc.items) {
        const s = norm(it.str);
        if (!s) continue;
        const y = it.transform[5], x = it.transform[4];
        let ln = lines.find((l) => Math.abs(l.y - y) < 3);
        if (!ln) lines.push((ln = { y, cells: [] }));
        ln.cells.push({ x, s });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) rows.push(l.cells.sort((a, b) => a.x - b.x).map((c) => c.s));
    }
    return rows;
  }

  async function fileRows(file) {
    const buf = await file.arrayBuffer();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) return excelRows(buf);
    if (ext === "pdf") return pdfRows(buf);
    return textRows(decodeText(buf), ext === "csv");
  }

  const H = { KEY, load, save, count, calc, toCsv, norm, toNum, textRows, parseRows, parseList, fileRows };
  if (typeof module !== "undefined" && module.exports) module.exports = H;
  else root.Holdings = H;
})(typeof window !== "undefined" ? window : globalThis);
