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
6. [ ] **本人**：確認 Phase 2 資料，用 GitHub Desktop commit + push（可與 Phase 3 一起）
7. [x] **Claude Code**：Phase 3（美股資料）（2026-10-09 完成，見 Phase 3「實作結果」）
8. [ ] **本人**：決定 SEC 聯絡 email，存成 GitHub Secret `SEC_USER_AGENT`（格式：`stock-dashboard 你的email`）；commit + push Phase 3
9. [ ] **Claude Code**：Phase 4（GitHub Actions 自動排程），之後 Phase 5、6

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
