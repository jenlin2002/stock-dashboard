# 台美股基本面網站：執行計畫

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
