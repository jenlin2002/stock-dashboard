# 台美股基本面網站：執行計畫

## 目前進度（交接說明，請先讀這段）

**已完成**
- [x] 在 claude.ai 完成資料來源評估與本計畫
- [x] 建立 GitHub repo `jenlin2002/stock-dashboard`（設為 Private）
- [x] 上傳本計畫檔到 repo 根目錄
- [x] 2026-10-09 改在 Claude 桌面 App（家裡電腦）作業；repo 用 GitHub Desktop clone 到 `H:\githubdata\stock-dashboard`

**接下來（依序）**
1. [x] **Claude Code**：實作 Phase 1（TradingView 看盤頁），完成後停下來說明如何測試（2026-10-09 完成，見 Phase 1「實測結果」）
2. [x] **本人**：測試 Phase 1；確認後讓 Claude Code 把變更合併到 `main` 分支（2026-10-09 已用 GitHub Desktop push）
3. [x] **本人**：照下方「Cloudflare 設定」部署網站並加上 Access 登入保護（2026-10-09 完成）
   - 網址：https://stock-dashboard-2fv.pages.dev （push 到 main 會自動部署）
   - Zero Trust 選 Free 方案；Access 應用程式「stock-dashboard - Cloudflare Pages」保護兩個網址：`stock-dashboard-2fv.pages.dev`（正式）和 `*.stock-dashboard-2fv.pages.dev`（每次部署的預覽網址）
   - 政策：Allow／Include Emails = 本人 email；登入方式 One-time PIN。已驗證未登入時會被導到 Cloudflare Access 登入頁。
4. [x] **本人**：FinMind token 已存入 GitHub Secret `FINMIND_TOKEN`（2026-10-09）。`fetch_tw.py` 有這個環境變數就自動帶 token；本機手動執行可不設（每小時約 300 次請求，每檔台股用 5 次）。Phase 4 的 workflow 要把 Secret 傳成環境變數。
5. [x] **Claude Code**：實作 Phase 2（2026-10-09 完成，見 Phase 2「實作結果」）
6. [x] **本人**：確認 Phase 2 資料，用 GitHub Desktop commit + push（與 Phase 3 一起）
7. [x] **Claude Code**：Phase 3（美股資料）（2026-10-09 完成，見 Phase 3「實作結果」）
8. [x] **本人**：SEC 聯絡 email 已存成 GitHub Secret `SEC_USER_AGENT`；Phase 2、3 已 commit + push（2026-10-09）
9. [x] **Claude Code**：Phase 4（GitHub Actions 自動排程）（2026-10-09 完成，見 Phase 4「實作結果」）
10. [x] **本人**：手動觸發 workflow #1 成功（2026-10-09，42 秒，綠燈＝兩個 Secret 都有效）。之後把 actions 升到 checkout@v5、setup-python@v6（v4／v5 用的 Node.js 20 已淘汰）。
11. [x] **Claude Code**：Phase 5（數據頁）（2026-10-09 完成，見 Phase 5「實作結果」；顏色本人選定**紅漲綠跌**）
12. [ ] **本人**：Fetch／Pull 後 commit + push，到網站確認個股頁、比較頁
13. [x] **Claude Code**：Phase 6（收尾）（2026-10-09 完成）：`README.md`（新增股票、手動更新、Secrets、網站內容、資料來源）；workflow 加上「push 改到 `config/watchlist.json` 就立刻抓台股＋美股」。免責聲明與資料來源已在各頁頁尾。
14. [x] **本人**：Fetch／Pull 後 commit + push（PHASE5V2）
15. [x] **Claude Code**：Phase 7（查詢任何股票）（2026-10-09，見下方「Phase 7」）
16. [ ] **本人**：在 Cloudflare 設定環境變數 `FINMIND_TOKEN`、`SEC_USER_AGENT`，然後 commit + push，到網站用搜尋框測試
17. [ ] **Claude Code**：Phase 8 主畫面與全台股（見下方「Phase 8」），依序 ①～⑥（①②③④ 完成；⑤ 類股資金流向、⑥ 美股總表待做）
18. [x] **Claude Code**：首頁「＋」加入追蹤、「×」移除（2026-10-10，本人要求）：`functions/api/watchlist.js` 用 GitHub contents API 改 `config/watchlist.json`（檢查 Origin、代號格式；sha 衝突重試一次；台股依代號排序；排版與手寫相同），commit 後觸發排程。前端改完把新清單存在瀏覽器 15 分鐘（網站重新部署前也看得到）；剛加入、還沒資料檔的股票先即時查詢。已用模擬 GitHub API 測過加入、重複加入、移除、中文名稱、錯誤代號、別的網站來源、未設權杖。
19. [x] **本人**：產生 fine-grained GitHub 權杖，存成 Cloudflare 環境變數 `GITHUB_TOKEN`（2026-10-10 完成）

**給 Claude Code 的規則**
- 每完成一個 Phase 就停下來，用繁體中文告訴本人怎麼測試，等確認後再繼續。
- 每完成一項，更新這段「目前進度」的勾選狀態並一起 commit。
- 追蹤清單先用計畫裡的範例股票。
- 任何 API key 都不能寫進程式碼。

---

> 把這份檔案放在專案根目錄，交給 Claude Code 依階段實作。
> 每完成一個階段就先上線測試，再進行下一階段。

## 專案目標

做一個靜態網站，程式碼放在 GitHub（Private repo），部署在 **Cloudflare Pages**，並用 **Cloudflare Access** 設定只有本人 email 能登入觀看。內容包括：

- **看盤頁**：用 TradingView Widget 顯示台美股的 K 線、報價和基本面摘要。
- **數據頁**：用自己抓的資料顯示月營收、財報趨勢、本益比等，可排序和比較。
- **年報連結**：台股連到公開資訊觀測站，美股連到 SEC 10-K。

資料更新方式：GitHub Actions 每天定時執行 Python 抓資料 → 存成 JSON → 自動 commit → Cloudflare Pages 偵測到 push 自動重新部署 → 前端讀 JSON。

## 技術選擇

| 項目 | 選擇 |
|---|---|
| 前端 | 純 HTML + CSS + JavaScript（不用框架），圖表用 Chart.js（CDN） |
| 圖表展示 | TradingView 免費嵌入式 Widget |
| 資料抓取 | Python 3.11 + requests（＋ FinMind 套件、yfinance） |
| 排程 | GitHub Actions（cron） |
| 程式碼 | GitHub **Private** repo `stock-dashboard`（與其他 repo 同階層） |
| 部署 | **Cloudflare Pages**（連結 GitHub repo，push 後自動部署；不需要 build 指令，輸出目錄為根目錄 `/`） |
| 存取控制 | **Cloudflare Access**（Zero Trust 免費方案），只允許本人 email 以一次性驗證碼登入 |
| 密鑰 | GitHub Secrets（`FINMIND_TOKEN` 等），**不可寫進程式碼** |

## 資料夾結構

```
stock-dashboard/
├── index.html              # 首頁：追蹤清單總覽
├── stock.html              # 個股頁：?symbol=2330 或 ?symbol=AAPL
├── compare.html            # 比較／篩選頁（Phase 4）
├── assets/
│   ├── style.css
│   ├── app.js              # 共用：讀 JSON、格式化數字
│   └── widgets.js          # TradingView Widget 產生函式
├── config/
│   └── watchlist.json      # 追蹤清單（唯一需要手動維護的檔案）
├── data/
│   ├── tw/2330.json        # 每檔台股一個檔
│   ├── us/AAPL.json        # 每檔美股一個檔
│   └── summary.json        # 首頁用的總表（所有股票最新指標）
├── scripts/
│   ├── fetch_tw.py
│   ├── fetch_us.py
│   ├── build_summary.py
│   └── requirements.txt
└── .github/workflows/
    └── update-data.yml
```

### config/watchlist.json 範例

```json
{
  "tw": [
    { "code": "2330", "name": "台積電", "market": "TWSE" },
    { "code": "6488", "name": "環球晶", "market": "TPEX" }
  ],
  "us": [
    { "ticker": "AAPL", "name": "Apple", "exchange": "NASDAQ" },
    { "ticker": "NVDA", "name": "NVIDIA", "exchange": "NASDAQ" }
  ]
}
```

（股票清單之後再換成自己要追蹤的。）

---

## Phase 1：TradingView 看盤頁（純前端，當天可上線）

**執行項目**
1. repo 已建立（Private）。網站部署由本人在 Cloudflare 後台設定（見下方「Cloudflare 設定」），程式碼不需要任何 Cloudflare 專用設定檔；所有頁面使用相對路徑。
2. `index.html`：讀 `watchlist.json`，台股和美股分成兩區列出卡片，每張卡片嵌入一個 *Mini Symbol Overview* Widget，點擊後進入個股頁。
3. 頁首加一條 *Ticker Tape* Widget，顯示整個追蹤清單。
4. `stock.html?symbol=xxx`：
   - *Advanced Real-Time Chart* Widget（K 線）
   - *Fundamental Data* Widget（基本面）
   - *Financials* Widget（財報摘要）
   - *Company Profile* Widget
5. 代號轉換規則寫在 `widgets.js`：
   - 上市 → `TWSE:2330`
   - 上櫃 → `TPEX:6488`
   - 美股 → `NASDAQ:AAPL` / `NYSE:XXX`
6. 深色和淺色主題跟隨系統設定；手機版要能正常瀏覽。

**做法重點**
- Widget 的嵌入碼從 TradingView 官網的 Widgets 頁取得，用 JavaScript 動態產生 `<script>` 標籤並傳入 symbol。
- 部分台股在某些 Widget 可能沒有資料，要顯示「此項目無資料」，不能讓整頁壞掉。

**驗收**：首頁看得到所有股票，點進個股頁四個 Widget 都正常顯示。

**實測結果（2026-10-09）**
- TradingView 免費 Widget **不提供上市（TWSE）股價**：報價、K 線、Mini Chart 都只顯示「此商品僅在TradingView上可用」。上櫃（TPEX）和美股正常；基本面、公司簡介上市股票也有資料。
- 因為讀不到 iframe 內容，改用市場判斷（`widgets.js` 的 `hasPrice`）：上市股票的股價類 Widget 顯示提示和「在 TradingView 開啟」連結，Ticker Tape 不放上市股票。
- TradingView 已沒有獨立的 Financials Widget（與 Fundamental Data 是同一個），個股頁上方改用 *Symbol Info* 報價 Widget。四個 Widget 為：Symbol Info、Advanced Chart、Fundamental Data、Company Profile。
- 頁尾免責聲明與資料來源已先加上（原屬 Phase 6）。
- **Phase 5 待辦**：上市股票的股價圖改用 Phase 2 抓的 FinMind 日 K 自己畫（例如 TradingView 開源的 lightweight-charts）。
- 本機預覽：在 repo 根目錄執行 `python -m http.server 8540`，開 http://localhost:8540。

---

## Phase 2：台股資料抓取

**資料來源**
| 資料 | 來源 |
|---|---|
| 日 K 歷史股價 | FinMind `TaiwanStockPrice` |
| 月營收 | FinMind `TaiwanStockMonthRevenue` |
| 損益表／資產負債表／現金流量表 | FinMind `TaiwanStockFinancialStatements`、`TaiwanStockBalanceSheet`、`TaiwanStockCashFlowsStatement` |
| 股利 | FinMind `TaiwanStockDividend` |
| 每日本益比、殖利率、股價淨值比 | TWSE OpenAPI `BWIBBU_ALL`（上市）／TPEx OpenAPI（上櫃），免 key |

**執行項目**
1. 到 finmindtrade.com 註冊並取得 token，存入 GitHub Secret `FINMIND_TOKEN`。
2. `fetch_tw.py`：
   - 讀 watchlist，逐檔抓上述資料。
   - **增量更新**：已存在的 JSON 只補最新日期之後的資料，第一次執行才抓完整歷史（建議抓 5 年）。
   - 每次請求之間 sleep 約 1 秒，避免超過免費額度。
   - 單檔失敗時記錄 log 並繼續處理下一檔，不中斷整個流程。
3. 輸出 `data/tw/{code}.json`（格式見下方）。

### 個股 JSON 格式（台美股共用）

```json
{
  "symbol": "2330",
  "name": "台積電",
  "market": "TW",
  "updated": "2026-10-09",
  "price": { "dates": [], "close": [], "volume": [] },
  "valuation": { "pe": 0, "pb": 0, "dividend_yield": 0 },
  "monthly_revenue": [ { "month": "2026-09", "revenue": 0, "yoy": 0, "mom": 0 } ],
  "quarterly": [ { "period": "2026Q2", "revenue": 0, "gross_profit": 0, "operating_income": 0, "net_income": 0, "eps": 0 } ],
  "dividends": [ { "year": 2025, "cash": 0, "stock": 0 } ],
  "reports": { "annual_report_url": "" }
}
```

- 股價只保留收盤價和成交量（壓縮檔案大小）。
- 美股沒有月營收，該欄位留空陣列。

**驗收**：本機執行 `python scripts/fetch_tw.py` 後，`data/tw/` 底下有正確的 JSON。

**實作結果（2026-10-09）**
- 檔案：`scripts/fetch_tw.py`、`scripts/common.py`（共用：讀 watchlist、寫 JSON、算成長率）、`scripts/requirements.txt`。
- 用法：`python scripts/fetch_tw.py`（整個清單）或 `python scripts/fetch_tw.py 2330`（指定代號）。2 檔第一次完整抓約 12 秒。
- **本益比改用 FinMind `TaiwanStockPER`**（上市、上櫃都有），不用 TWSE／TPEx OpenAPI：證交所 OpenAPI 的 SSL 憑證不符合新版 Python 的檢查，會連線失敗。
- **股價改存 OHLC＋成交量**（`open/high/low/close/volume`，volume 為股數）：上市股票 TradingView 不給 K 線，Phase 5 要用這份資料自己畫。5 年約 1,200 天，每檔 JSON 約 65KB。
- 增量更新：股價從最後一天起補抓；月營收從最後兩個月起重抓（公司偶爾更正）。季報、股利資料量小，每次重抓 5 年。
- 季報是**單季**數字；`net_income` 用「歸屬母公司淨利」，與 EPS 同基礎。
- 股利依「所屬年度」加總（「114年第3季」「114年前半年度」都算 2025）；當年度只含已公布的部分。
- 資產負債表、現金流量表暫不抓：Phase 5 的圖表用不到，需要時再加。
- 年報連結：`https://doc.twse.com.tw/server-java/t57sb01?step=1&colorchg=1&co_id={代號}&year={民國年}&mtype=F`（公開資訊觀測站「股東會年報」清單；6 月起指向去年度）。
- 單檔失敗（例如代號打錯、查無股價）只會警告並跳過，不寫檔；全部失敗才回傳錯誤碼。
- 已核對：台積電 2026/9 營收 5,118.6 億、YoY +54.65%；2026Q2 EPS 27.25；2025 年度現金股利合計 22 元。

---

## Phase 3：美股資料抓取

**資料來源**
| 資料 | 來源 |
|---|---|
| 財報數字（營收、淨利、EPS 等） | SEC EDGAR `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` |
| 代號轉 CIK | `https://www.sec.gov/files/company_tickers.json` |
| 10-K 年報連結 | `https://data.sec.gov/submissions/CIK##########.json` |
| 股價 | 先用 **yfinance**；之後可換成 **Schwab API**（見下方說明） |

**執行項目**
1. `fetch_us.py`：
   - 呼叫 SEC API 時 **必須設定 User-Agent**（格式：`名稱 email`），且每秒不超過 10 次請求。
   - 從 companyfacts 取出 `us-gaap` 下的 `Revenues`／`RevenueFromContractWithCustomerExcludingAssessedTax`、`NetIncomeLoss`、`EarningsPerShareDiluted`、`GrossProfit`、`OperatingIncomeLoss`。
   - 注意：**各公司使用的營收標籤不同**，要依序嘗試多個標籤；季度資料要依 `fp`、`form` 欄位分辨 10-Q 和 10-K，避免重複計算。
   - 從 submissions 找最新一份 10-K，組出年報連結。
   - yfinance 抓日 K 和本益比。
2. 輸出 `data/us/{ticker}.json`，格式與台股相同。

**Schwab API（ThinkorSwim）說明**
- 到 developer.schwab.com 註冊 App 並等待審核。
- refresh token 大約 **每 7 天過期**，需要手動重新登入，所以**不適合放進 GitHub Actions 全自動執行**。
- 建議做法：先用 yfinance 上線；之後如果 yfinance 不穩定，再另外寫 `fetch_us_schwab.py` 在自己電腦上執行，或每週手動更新一次 Secret 中的 token。

**驗收**：`data/us/` 底下的 JSON 財報數字與 SEC 網站上的數字一致（抽查 2～3 檔）。

**實作結果（2026-10-09）**
- 檔案：`scripts/fetch_us.py`；`requirements.txt` 加入 `yfinance`。用法：`python scripts/fetch_us.py` 或 `python scripts/fetch_us.py AAPL`。
- **SEC 一定要 User-Agent 含 email**，否則回 403。程式讀環境變數 `SEC_USER_AGENT`（例：`stock-dashboard 你的email`），不寫在程式碼裡；GitHub Actions 用同名 Secret。
- 營收標籤依序嘗試 `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` → `SalesRevenueNet` → `...IncludingAssessedTax`，同一季以前面的為準（NVIDIA 2022 年起改用 `Revenues`）。沒有 `GrossProfit` 的公司用「營收 − 營業成本」。
- 只採用 10-Q／10-K（含 /A 更正）的數字，同一期間以最新申報為準（NVIDIA 的淨利混有 DEF 14A 的數字）。
- 單季判斷用期間長度（80～100 天）。**第 4 季**10-K 只報全年，用「全年 − 前三季累計」推算；EPS 推算值可能差 0.01（例：Apple FY2025 Q4 推算 1.84，公布 1.85）。
- 季報多兩個欄位：`fiscal`（財報季，例 `FY2027 Q1`）、`end`（季末日）。`period` 是對齊最近日曆季的標示（NVIDIA 4/26 結束的季 = `2026Q1`，與 SEC frame 相同），方便和台股比較。
- 股價：yfinance、分割已調整、股利未調整，同樣存 OHLC＋成交量（股數），增量更新。Yahoo 失敗時沿用舊股價，財報照常更新。
- 本益比 `trailingPE`、股價淨值比 `priceToBook`、殖利率用 `trailingAnnualDividendYield`×100（近 12 個月，與台股定義相同）。
- 股利依除息日的日曆年加總。
- 已核對：Apple FY2025 Q4 營收 102,466M（推算，與公布 102.47B 相符）；NVIDIA FY2026 Q2 營收 46,743M。

---

## Phase 4：自動排程

**執行項目**
1. `.github/workflows/update-data.yml`：
   - 排程：週一至週五，台灣時間 16:00 跑台股（cron `0 8 * * 1-5`，GitHub 使用 UTC）；台灣時間 06:00 跑美股（cron `0 22 * * 1-5`）。
   - 也要加上 `workflow_dispatch`，可以手動觸發。
   - 步驟：checkout → 安裝 Python → `pip install -r requirements.txt` → 執行抓取腳本 → `build_summary.py` → 有變更才 commit 和 push。
   - 權限設定：`permissions: contents: write`。
2. `build_summary.py`：彙整所有個股的最新指標到 `summary.json`，給首頁和比較頁使用。

**驗收**：手動觸發一次 workflow 成功，repo 出現自動 commit。

**實作結果（2026-10-09）**
- `.github/workflows/update-data.yml`（名稱「更新股票資料」）：UTC 08:00 週一～五跑台股、UTC 22:00 週一～五跑美股；手動觸發可選 all／tw／us。job 設 `TZ: Asia/Taipei`，JSON 的日期用台灣時間。
- Secrets 以環境變數傳入：`FINMIND_TOKEN`（台股）、`SEC_USER_AGENT`（美股）。
- 抓取步驟 `continue-on-error`：某市場全部失敗時，另一市場和 summary 仍會 commit，最後一步再讓 workflow 變紅燈（GitHub 會寄通知信）。部分股票失敗只會在紀錄裡出現「[警告]」，仍是綠燈。
- commit 前 `git pull --rebase`，避免和手動 push 衝突。每次 push 都會觸發 Cloudflare 重新部署（每月約 44 次，遠低於 500 次上限）。
- `scripts/build_summary.py` → `data/summary.json`：依 watchlist 順序，每檔一行；欄位：symbol、name、market、exchange、updated、price_date、price、change_pct、pe、pb、dividend_yield、revenue_month、revenue_yoy（台股）、quarter、eps_ttm（近四季 EPS 合計）、gross_margin、operating_margin（最新一季，%）。
- 已核對：股價 ÷ eps_ttm 與資料來源的本益比一致（台積電 2550 ÷ 86.28 = 29.56；Apple 340.42 ÷ 8.71 ≈ 39.04）。

---

## Phase 5：數據頁（前端讀自己的 JSON）

**執行項目**
1. `stock.html` 在 TradingView Widget 下方加入：
   - 月營收長條圖，並標示 YoY 線（台股）
   - 近 8 季營收、毛利率、營益率、EPS 趨勢圖
   - 股利歷史表
   - 「年報」按鈕：台股連到公開資訊觀測站年報頁，美股連到最新 10-K
   - 頁面顯示「資料更新日期」
2. `compare.html`：
   - 從 `summary.json` 讀出表格，欄位包括代號、名稱、股價、本益比、殖利率、最新月營收 YoY、近四季 EPS。
   - 可以點欄位標題排序，也可以篩選台股、美股或全部。
3. 數字格式：台股營收以「億元」顯示，美股以「B / M」顯示；正數綠色、負數紅色（或依習慣改成台股的紅漲綠跌，**要統一**）。

**驗收**：個股頁的圖表正常，比較頁可以排序和篩選。

**實作結果（2026-10-09）**
- 顏色：**紅漲綠跌**（CSS 變數 `--up` 紅、`--down` 綠，深淺色各一組）。用在自己畫的 K 線、報價、比較頁漲跌與 YoY、EPS 柱（與去年同季比：成長紅、衰退綠）。**TradingView 元件（跑馬燈、Mini、Advanced Chart）的配色無法改，仍是綠漲紅跌。**
- 新增 `assets/charts.js`：K 線用 lightweight-charts 4.1.3（含 20／60 日均線、成交量；台股成交量換算成「張」），其餘用 Chart.js 4.4.1，都從 jsDelivr 載入。深淺色切換時重畫。
- `stock.html`：
  - 頂部改為自己的報價列（收盤價、漲跌、本益比、股價淨值比、殖利率、近四季 EPS、收盤日與資料更新日）＋「年報」按鈕（台股→公開資訊觀測站、美股→最新 10-K）。原本的 TradingView Symbol Info 元件拿掉（與報價列重複）。
  - K 線：上市股票用自己的資料畫；上櫃、美股仍用 TradingView Advanced Chart。
  - 月營收（台股，近 36 個月，長條＋YoY 折線）、近 8 季營收＋毛利率＋營益率、近 8 季 EPS、股利表。美股季度標示用財報季（FY26 Q3）。
  - 基本面、公司簡介（TradingView）移到最下面。
  - 沒有資料檔的股票（例如剛加進清單、排程還沒跑）只顯示 TradingView 部分。
- `index.html`：上市股票卡片改用自己的資料（收盤價、漲跌、近一年走勢 SVG），不再空白。頁首加「比較」連結。
- `compare.html`：讀 `data/summary.json`；欄位：代號、名稱、股價、漲跌、本益比、股價淨值比、殖利率、月營收 YoY、近四季 EPS、毛利率、營益率、財報季。點標題排序（數字欄預設由大到小，空值永遠排最後），全部／台股／美股篩選，點列進個股頁。篩選與排序記在瀏覽器 localStorage。
- 已在本機驗證：4 檔個股頁、首頁、比較頁無 JS 錯誤；手機 375px 無橫向捲動（比較表在框內橫向滑動）；深色模式正常。

**Phase 5 追加（2026-10-09，本人要求）**
- **所有股票的 K 線都改用自己的日 K 資料畫**（紅漲綠跌統一；TradingView 嵌入元件無法使用本人帳號的付費資料與自訂 Pine 指標）。首頁卡片、頁首報價列也改用自己的資料。個股頁加「在 TradingView 開啟」按鈕（`/chart/?symbol=`，用本人登入看盤中與自訂指標）。
- 技術指標（`assets/indicators.js`，自己實作的標準公式，不是照抄本人的 Pine 程式）：
  - 主圖均線 **MA 8／21／55／89**（簡單均線，可個別開關）。
  - 成交量 **均量 5／13／34**。台股成交量單位為「張」。
  - **扣抵（動態）**：游標指到哪一天，就以那天為基準，在每條均線、均量的扣抵 K 棒上標箭頭、畫扣抵價虛線；沒指著時以最新一天為準。
  - 扣抵表（跟著游標）：目前值、下一日扣抵值、下一日方向（收盤／量不變時上揚或下彎）、轉向門檻（漲跌幅）、接下來 5 日扣抵（扣低／扣高／持平）。
  - 副圖：**DMI（13，Wilder；ADX 25 參考線）**為預設，另可切 KD（9,3,3）、MACD（12,26,9）或不顯示；與主圖同步捲動、縮放。
  - 設定記在瀏覽器 localStorage（`kline-opts-v2`）。
- 待確認：本人 TradingView 上「DMI 13 75 25 5」後面參數的意義；目前 DI 與 ADX 都用 13。

**TradingView 版（2026-10-09，本人要求）**：同一套指標的 Pine Script v6，放在 `tradingview/`：
- `1_deduct_ma.pine`：主圖 MA 8/21/55/89＋扣抵標記、扣抵價虛線、扣抵表。
- `2_deduct_volume.pine`：成交量（紅漲綠跌）＋均量 5/13/34＋扣抵標記。
- `3_dmi.pine`：DMI 13（+DI 紅、−DI 綠、ADX 藍、25 參考線）。
- 差異：Pine 無法跟著游標移動，「動態」是指每根新 K 棒（含即時盤）都重新計算；任何週期（5 分、日、週）都能用。
- 安裝：TradingView → Pine 編輯器 → 新建指標 → 貼上 → 儲存 → 加到圖表（三支各做一次）。修改時改 repo 裡的檔案再貼回去。

---

## Phase 7：查詢任何一檔股票（2026-10-09，本人追加）

本人需求：不只追蹤清單，**輸入任何代號或名稱都能看完整資料**。

- `scripts/build_stocklist.py` → `data/stocklist.json`：台股上市＋上櫃（FinMind `TaiwanStockInfo`，約 2,800 檔，含產業別）、美股 Nasdaq／NYSE／CBOE（SEC `company_tickers_exchange.json`，約 7,700 檔，含 CIK）。約 500KB，排程台股那次一起更新。
- `assets/search.js`：每頁頁首搜尋框，代號或名稱都可搜（代號完全相符 > 代號開頭 > 名稱開頭 > 名稱包含），上下鍵選擇、Enter 進入。
- `functions/api/stock.js`（Cloudflare Pages Function，`/api/stock`）：即時抓不在清單的股票，輸出與 `data/*.json` 相同格式（`live: true`）。邏輯移植自 `fetch_tw.py`、`fetch_us.py`，已核對 2330、AAPL、NVDA 與排程檔案逐欄相同。
  - 台股：FinMind 5 個資料集平行抓取。
  - 美股：SEC **companyfacts**（不用 companyconcept：KO 等公司會回傳空資料）。companyfacts 3～5MB，整個解析要 20ms 以上，超過 Cloudflare 免費方案每次約 10ms CPU，所以用 `extractTags()` 單次掃描文字、只解析需要的欄位（約 4ms，與完整解析結果相同）。股價、股利用 Yahoo chart API（從 5 年前的 1/1 抓起，股利年度才完整）。本益比＝股價 ÷ 近四季 EPS；沒有股價淨值比。
  - 快取 6 小時（瀏覽器 Cache-Control；pages.dev 上的 Cache API 可能無效）。財報抓不到時回傳 `notice`，只快取 10 分鐘。
- `stock.html`：先查 watchlist → 再查 stocklist → 都沒有就依格式猜（純數字＝上市）。不在清單就呼叫 `/api/stock`，顯示「即時查詢」與可複製的 watchlist 設定行。
- **Cloudflare 環境變數**（Pages → Settings → Variables and Secrets → Production）：`FINMIND_TOKEN`、`SEC_USER_AGENT`。沒設 SEC_USER_AGENT 時美股財報會失敗（股價仍有）。
- 本機測試：`npx wrangler pages dev . --port 8542`，`.dev.vars` 放測試用環境變數（gitignore）。

---

## Phase 8：主畫面（左側選單＋右側內容）與全台股資料（2026-10-09 規劃，本人確認）

**版面**：每頁左側固定選單（大項目＋細項），右側是內容；手機時選單收成頁首「☰」。每個項目是獨立頁面、共用同一份選單（`assets/layout.js`），可加書籤、上一頁正常。

| 選單 | 頁面 | 內容 |
|---|---|---|
| 📈 大盤 | `market.html` | 加權指數 K 線（含指標）、成交金額、漲跌家數、三大法人買賣超、融資融券 |
| 💰 類股資金流向 | `flow.html` | 各類股成交比重與增減（資金流入／流出）、類股指數漲跌；法人個股買賣超排行 |
| 📋 全台股總表 | `all.html` | 上市＋上櫃**普通股（不含 ETF）**，從 1101 到最後一家，每檔一列：代號、名稱、產業、市場、股價、漲跌、本益比、**PEG**、殖利率、股價淨值比、最新月營收與 YoY、累計營收 YoY、近四季 EPS、EPS 成長、毛利率；可排序、依產業／市場篩選、搜尋，點列進個股 |
| 🔍 個股分析 | `stock.html` | 現有個股頁＋PEG／估值 |
| ⭐ 我的追蹤 | `index.html`、`compare.html` | 現有追蹤清單、比較表 |

**資料**（排程收盤後抓、存檔；TWSE／TPEx OpenAPI 一次拿全部股票，已實測可用）：
- 全部股價、漲跌：TWSE `STOCK_DAY_ALL`、TPEx `tpex_mainboard_daily_close_quotes`
- 本益比、殖利率、股價淨值比：TWSE `BWIBBU_ALL`、TPEx `tpex_mainboard_peratio_analysis`
- 月營收：TWSE `t187ap05_L`、TPEx `mopsfin_t187ap05_O`
- 綜合損益（最新一季累計）：TWSE `t187ap06_L_*`、TPEx `mopsfin_t187ap06_O_*`（依產業別分一般業、金控、銀行、證券、保險、其他）
- 公司基本資料（產業別、範圍＝公司，自然排除 ETF）：TWSE `t187ap03_L`、TPEx `mopsfin_t187ap03_O`
- EPS 歷史（PEG 用）：OpenAPI 只有最新一季，先從公開資訊觀測站彙總報表回補 3 年，之後每季自動累積
- 大盤、類股指數與成交、法人、融資融券：TWSE

**PEG**＝本益比 ÷ EPS 成長率（%）；成長率＝近四季 EPS 對前四季 EPS。EPS ≤ 0 或成長 ≤ 0 時不計算（顯示「—」）。

**順序**：① 外框（左右版面、手機選單）→ ② 全台股總表 → ③ PEG（回補 EPS 歷史）＋評分卡 → ④ 大盤 → ⑤ 類股資金流向。

**① 完成（2026-10-10）**：`assets/layout.js` 在每頁建立左側選單（大項目＋所在頁的細項；未完成的顯示「建置中」），把頁首以下內容包進右側。寬度 ≤ 900px 時選單收成「☰」抽屜。「個股分析」記住最後看的股票（localStorage `last-symbol`）。頁首原本的連結隱藏，改由選單提供。

**② 完成（2026-10-10）**：`scripts/build_all.py` → `data/all/stocks.json`（1,988 家公司，1,956 家有收盤價，約 333KB，欄位表＋列陣列）；排程台股那次一起更新。`all.html`：
- 依股號（預設 1101 起）／依產業（`?view=industry`：各產業家數、市值加權漲跌、漲跌家數、總市值、本益比與營收 YoY 中位數，點產業只看該產業）。
- 欄位：代號、名稱、產業、市場、股價、漲跌、成交量（張）、市值（億）、本益比、PEG（③ 後）、殖利率、淨值比、月營收（億）、營收 YoY、累計 YoY、近四季 EPS、今年 EPS（季別）、毛利率、營益率。點標題排序、市場／產業篩選、代號名稱篩選；表頭與代號名稱固定；一次畫 200 列、捲到底再載入。
- 近四季 EPS＝收盤 ÷ 證交所本益比（台積電 86.27，與 FinMind 86.28 相符）；市值＝收盤 × 已發行普通股數（台積電 66.13 兆）。
- 官方月營收彙總比個股公布晚幾天（10/9 時仍是 8 月）。
- 產業名稱以證交所為準，FinMind 補的「金融業」併入「金融保險業」。

**③ 本人追加：PEG 評分卡（2026-10-10）**：仿 Jim Slater《祖魯法則》REFS 卡片（本人提供書頁照片）。個股頁一張卡，每個指標旁兩顆圓圈：**m＝與全市場比、s＝與同產業比**，依該指標在全部股票中的五分位塗滿程度（全黑＝最好的 20%、¾、½、¼、空心＝最差 20%，⊕＝無資料）。方向：本益比、PEG、淨值比、股價營收比越低越好；殖利率、成長率、ROE、毛利率越高越好。台股用近四季實際數字（書上是分析師前瞻預估，需付費資料）。預計指標：股價、市值與排名、近四季 EPS、營收、殖利率、本益比、PEG、EPS 成長率、ROE（＝淨值比 ÷ 本益比）、毛利率、負債比（槓桿）、淨值比、股價營收比、每股淨值。全台股總表另加 PEG 燈號欄。

**③ 完成（2026-10-10）**：
- `scripts/fundamentals.py`（build_all.py 呼叫）：
  - **一年前近四季 EPS**：證交所 `rwd/zh/afterTrading/BWIBBU_d`、櫃買 `peratio_analysis/pera_result.php`＋`www/zh-tw/afterTrading/otc`（一年前那天的收盤、本益比、財報年/季）→ 收盤 ÷ 本益比；**只在財報季正好是去年同一季時才比**。約 1,321 家可比。
  - **資產負債表**：OpenAPI `t187ap07_L_*`／`mopsfin_t187ap07_O_*` → 負債比（負債÷資產）、每股淨值。
  - **月營收歷史**：公開資訊觀測站 `mopsov.twse.com.tw/nas/t21/{sii,otc}/t21sc03_{民國年}_{月}_{0,1}.html`（0 本國、1 外國 KY），快取在 `data/all/revenue_hist.json`，每次只補新月份並重抓最近兩個月 → 近 12 個月營收、股價營收比；最新月份比 OpenAPI 新就覆蓋月營收欄位。
- 新欄位：`pe_period, eps_prev, eps_growth, peg, roe, debt_ratio, bvps, rev_ttm, psr`。PEG 只在 **0 < EPS 成長 ≤ 100%** 時計算（超過多為低基期，顯示「基期低」），約 608 家有 PEG。台積電 PEG 0.55、鴻海 1.04、富邦金 0.41、環球晶 1.10。
- **推估 PEG（本人要求填滿空白，2026-10-10）**：有獲利但 EPS 成長不能用（衰退、低基期、沒有去年可比）時，用「本益比 ÷ 今年累計營收成長（0～100%）」推估，欄位 `peg_est`，灰字標「估」；推不出來時 `peg_note` 記原因（虧損、EPS 衰退且營收也衰退…），網頁顯示原因而非空白。608 家實際 PEG＋575 家推估；評分卡與總表的燈號把推估值放在實際 PEG 的分布裡比。總表 PEG 欄依「實際值，沒有就推估值」排序。
- `assets/refs.js` 評分卡：在瀏覽器即時算五分位（全市場、同產業；同業 < 5 家不比；本益比等只比正數）。個股頁「本益成長比評分卡」（台股），左卡右說明；選單「個股分析 → PEG 評分卡」。全台股總表加 PEG（含燈號）、EPS 成長、ROE、營收比、負債比。
- 排程執行時間約 1.5 分鐘（第一次回補 12 個月營收較久）。

**現金流量（2026-10-10，本人要求）**：證交所／櫃買 OpenAPI 沒有現金流量表，用 FinMind `TaiwanStockCashFlowsStatement` 逐檔抓，`scripts/fetch_cashflow.py` 每次輪流更新最久沒更新的 450 檔（約 5 天輪完、額度用完自動停並存檔），快取 `data/all/cashflow.json`。現金流量表是年初至今累計：近四季＝今年累計＋去年全年－去年同期。新欄位 `cf_period, cfo_ttm, capex_ttm, fcf_ttm, pcf（股價現金流量比）, fcf_yield（自由現金流殖利率）, cfps, fcfps`；評分卡加「股價現金流量比」「自由現金流殖利率」與每股現金流；總表加現金流量比、FCF 殖利率、自由現金流。排程的股票清單、現金流、總表三步只在每日排程或手動執行時跑（網站「＋」觸發的不跑，省 FinMind 額度）。
- 月營收歷史改留 13 個月：每月 10 日前還沒公布最新月份的公司，改用前 12 個月算近 12 個月營收（覆蓋從 1,607 家增加到 1,976 家）。

**匯出 Excel（2026-10-10，本人要求）**：全台股總表右上「⬇ 匯出 Excel」，匯出目前篩選、排序後的全部股票（不只畫面已載入的）、36 個欄位，數字保持數值格式、凍結標題列與代號名稱；用 SheetJS 0.18.5（cdnjs，按下時才載入）。檔名含收盤日與篩選條件。

**K 線週期分頁（2026-10-10，本人要求）**：1分／5分／15分／30分／60分／日／週／月。日線用自己的資料；週、月由日線合併（週一開始、以第一個交易日標示）；分鐘線由 `functions/api/intraday.js` 轉抓 Yahoo chart API（延遲報價；台股 `.TW`／`.TWO`；1 分最近 5 天、5～30 分 60 天、60 分 1 年；瀏覽器快取 1 分鐘）。所有指標與動態扣抵都以「根」計算，扣抵表文字改成「下一根」。選的週期記在 `kline-opts-v2`。

**我的追蹤：台股／美股分頁（2026-10-10，本人要求）**：首頁兩區改成同一畫面的兩個分頁（顯示檔數），網址 `#tw`／`#us`，記住上次看的分頁；左側選單「我的追蹤」細項改為台股、美股、比較表（在首頁時只切分頁不重新載入）。另修：全域 `[hidden]{display:none!important}`，避免 `.grid` 等 display 規則讓 hidden 失效。即時查詢美股時若沒有 CIK，自動從股票清單補上（剛加入、排程還沒跑時財報也看得到）。

**我的追蹤：顯示方式（2026-10-10，本人要求）**：分頁列右邊三個按鈕：小方塊（一排更多檔、走勢圖變矮）、大方塊（原樣）、清單（一檔一列＋小走勢線，手機上股價與漲跌分兩行）。選擇記在 `watch-view`，台股美股一起套用。另外右側內容改成靠左（緊貼選單）、最寬 1600px。
- 清單模式改成表格（本人要求「跟全台股總表一樣欄位，多一個趨勢圖」）：欄位定義抽成共用的 `assets/stockcols.js`（`StockCols.tw()`、`StockCols.us()`），all.html 與 index.html 都用它，兩邊永遠一致；清單在「漲跌」後多一欄「近一年走勢」小圖。台股資料來自 `data/all/stocks.json`，美股來自 `data/summary.json`（美股沒有全市場總表，欄位較少）。可點標題排序、點列進個股、右邊 × 移除、最下面「＋ 加入」。

**深色／淺色切換（2026-10-10，本人要求）**：頁首右邊 🌙／☀️ 按鈕，選擇存在 localStorage `theme`，沒選就跟系統；各頁 `<head>` 先套用避免閃爍；圖表與 TradingView 元件跟著重畫（`App.onThemeChange` 同時聽手動切換與系統改變）。

**④ 大盤完成（2026-10-10）**：`market.html`，分「台股大盤／美股大盤」兩個分頁（`#tw`／`#us`）。
- 台股：`scripts/build_market.py` → `data/market.json`（FinMind：加權 TAIEX、櫃買 TPEx 日 K＋成交金額；台指期 TX 一般時段、每天取成交量最大的單一月份契約；三大法人現貨買賣超；融資餘額（元）、融券餘額（張）；三大法人台指期淨未平倉口數）。增量更新，K 線 5 年、其他 1 年；排程台股那次跑。
  - 方塊：加權、櫃買、台指期（基差＝期貨−現貨）、上市＋上櫃成交金額（比 5 日均）、漲跌家數與漲跌停（全台股總表）、三大法人、外資期貨淨未平倉、融資餘額、台積電 ADR、美元兌台幣。
  - K 線：加權／櫃買／台指期切換，含量（指數＝成交金額億元、台指期＝口），套用個股頁的 MA、扣抵、副圖設定。加權有 1～60 分（Yahoo ^TWII，沒有盤中量）；櫃買、台指期只有日週月（沒有免費盤中資料，按鈕停用）。
  - 圖表：三大法人買賣超（20 日）、台指期淨未平倉（60 日）、融資融券餘額（120 日）。
- 美股（本人要求「各大工業指數，同樣台美股要區分」）：K 線道瓊、那斯達克、標普 500、費半、羅素 2000（`functions/api/intraday.js` 擴充 `market=idx`，白名單代號，tf 可為 D＝日線 5 年或 1～60 分）；方塊 `functions/api/quotes.js?set=us`：五大指數、VIX、10 年期公債殖利率、美元指數、美元兌台幣、黃金、原油、台積電 ADR（快取 2 分鐘）。

**熱力圖（2026-10-10，本人追加）**：大盤頁兩個分頁各一張，`assets/heatmap.js`（squarified treemap，方塊＝市值、顏色＝漲跌，紅漲綠跌，依產業分區，點方塊進個股；深底白字不隨主題變）。
- 台股：`data/all/stocks.json`，前 100／前 300／全部、上市＋上櫃／上市／上櫃；顏色 ±5% 飽和。
- 美股：`scripts/build_us_all.py` → `data/all/us_stocks.json`（Nasdaq 選股器 `api.nasdaq.com/api/screener/stocks`，一次拿全部美股 ~5,800 檔：價格、漲跌、成交量、市值、產業 sector/industry、國家；排除特別股、權證；免 key），前 100／300／500 大；顏色 ±3% 飽和。美股收盤後那次排程跑。這份資料也可作為 ⑥ 美股總表的基礎。
- 「個股／類股」切換（本人要求「熱力圖加上類股」）：類股模式每個產業一塊（大小＝總市值、顏色＝市值加權漲跌，顏色範圍縮成 60%），滑鼠看家數與漲跌家數；點類股方塊切回個股並只看該類股（美股再依細產業 industry 分區），「✕ 看全部」返回。美股細產業名稱是英文（Nasdaq 原始分類）。

**K 線「查價」開關（2026-10-10，本人要求並更正）**：副圖按鈕旁的「查價」勾選框（個股頁、大盤頁共用 `kline-opts-v2.track`）。打勾：滑鼠指到的 K 棒旁跳出資訊小框（日期、開高低收、漲跌、量、各均線；靠邊自動換邊），上方數值、動態扣抵、扣抵表也跟著換成那一根；不打勾：只有十字線（不顯示小框，數值固定在最新一根）。`Charts.kline` 的 `opts.track`；量的單位由 `d.volUnit` 指定（台股張、指數億、台指期口）。
- 副圖加 **RSI**（本人說的「SI 指標」確認是 RSI）：RSI 6、RSI 12（Wilder 平滑），70／50／30 參考線；個股頁、大盤頁都有。已用 Python 獨立計算核對台積電 RSI6 61.08、RSI12 62.20 一致。

**⑥ 美股總表（本人追加，待規劃）**：選單加「美股總表」，類似全台股總表。需找美股全部股票的批次來源（候選：SEC frames API 一次拿某季全部公司的營收／EPS；股價與市值另找），規劃後再做。

---

## Cloudflare 設定（本人在網頁後台操作，Phase 1 完成並 push 後進行）

1. 註冊 Cloudflare 免費帳號。
2. Workers & Pages → 建立 → Pages → 連結 Git → 授權 GitHub，只授權 `stock-dashboard` 這個 repo。
3. 建置設定：Framework 選 None、Build command 留空、Build output directory 填 `/`，儲存並部署，得到網址 `stock-dashboard-xxx.pages.dev`。
4. Zero Trust → 選擇免費方案（最多 50 位使用者）。
5. Access → Applications → 新增 Self-hosted 應用程式，網域填上一步的 `.pages.dev` 網址；Policy 動作選 Allow，規則選 Emails，填入本人 email；登入方式使用 One-time PIN。
6. 用無痕視窗開網址測試：應該先出現 Cloudflare 登入頁，輸入 email 收到驗證碼後才看得到網站。

注意：Cloudflare Pages 免費方案每月有部署次數上限（約 500 次），每天排程更新 2 次遠低於上限。

---

## Phase 6：收尾

1. 網站設有登入保護，不在學習入口網站放連結；本人可把網址加到手機主畫面。
2. README：說明如何新增股票（只需修改 `watchlist.json`）和如何手動更新資料。
3. 頁尾加上免責聲明：資料僅供參考，不構成投資建議；並標示資料來源（TWSE、TPEx、FinMind、SEC、TradingView）。

---

## 注意事項

- **API key 一律放在 GitHub Secrets**，前端程式碼不能出現任何 key。
- 不要把年報 PDF 下載進 repo（檔案太大），只存連結。
- 追蹤清單超過約 50 檔時，要注意 FinMind 免費額度和 Actions 執行時間，必要時改成分批更新。
- TradingView Widget 只能顯示資料，不能讀取裡面的數字；不要使用非官方的 TradingView 爬取套件（違反使用條款）。
- 各家 API 的免費額度和端點可能變動，抓取失敗時先查官方文件。

---

## 給 Claude Code 的開場指令（可直接貼上）

> 請閱讀 `stock-dashboard-PLAN.md`，依照計畫從 Phase 1 開始實作。每完成一個 Phase 就停下來，告訴我怎麼測試，等我確認後再繼續下一個 Phase。追蹤清單先用計畫裡的範例股票。
