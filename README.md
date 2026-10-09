# 台美股看盤（stock-dashboard）

個人用的台美股基本面網站：K 線與技術指標、月營收、季度財報、股利、比較表。

- 網址：https://stock-dashboard-2fv.pages.dev （Cloudflare Access 保護，只有本人 email 能登入）
- 程式碼：GitHub Private repo `jenlin2002/stock-dashboard`，push 到 `main` 後 Cloudflare Pages 自動部署
- 詳細的設計與進度：[`stock-dashboard-PLAN.md`](stock-dashboard-PLAN.md)

> 資料僅供參考，不構成投資建議。

---

## 查詢任何一檔股票

每頁上方的搜尋框可以輸入**代號或名稱**（`2454`、`聯發科`、`TSLA`、`coca`），從所有上市、上櫃台股與 Nasdaq／NYSE／CBOE 美股中找出建議。

- 在追蹤清單裡的股票：讀排程每天抓好的資料檔。
- 不在清單裡的股票：由 Cloudflare Pages Function（`functions/api/stock.js`）**即時**向 FinMind、SEC、Yahoo 抓取，約 1～3 秒，結果快取 6 小時。頁面會顯示「即時查詢」與一行可複製的 watchlist 設定。
- 搜尋用的全部股票清單是 `data/stocklist.json`（排程每天更新，`scripts/build_stocklist.py`）。

即時查詢需要在 **Cloudflare** 設定環境變數（GitHub Secrets 只給排程用，Cloudflare 讀不到）：
Cloudflare → Workers & Pages → `stock-dashboard` → Settings → **Variables and Secrets** → Production 加入 `FINMIND_TOKEN`、`SEC_USER_AGENT`（類型選 Secret），之後的部署才會生效。

美股即時查詢沒有股價淨值比；本益比以「最新股價 ÷ 近四季 EPS」計算。ETF 沒有財報，只顯示股價與股利。

本機測試 Function：`npx wrangler pages dev . --port 8542`（需 Node.js；環境變數放在 `.dev.vars`，已列入 .gitignore）。

---

## 新增或移除股票（追蹤清單）

只要改 **`config/watchlist.json`** 這一個檔案。

```json
{
  "tw": [
    { "code": "2330", "name": "台積電", "market": "TWSE" },
    { "code": "6488", "name": "環球晶", "market": "TPEX" }
  ],
  "us": [
    { "ticker": "AAPL", "name": "Apple", "exchange": "NASDAQ" },
    { "ticker": "KO", "name": "可口可樂", "exchange": "NYSE" }
  ]
}
```

| 欄位 | 說明 |
|---|---|
| `code` | 台股代號（字串，要加引號） |
| `market` | **上市填 `TWSE`、上櫃填 `TPEX`**（填錯的話 TradingView 的基本面、公司簡介會找不到） |
| `ticker` | 美股代號 |
| `exchange` | `NASDAQ`、`NYSE` 或 `AMEX` |
| `name` | 網站上顯示的名稱，可以自己取 |

注意：每一項之間要有逗號，最後一項後面**不能**有逗號。

**最簡單的改法（不用開電腦裡的程式）**：在 GitHub 網頁打開 `config/watchlist.json` → 右上角鉛筆圖示編輯 → **Commit changes**。

改完推上 GitHub 後，排程會**自動立刻抓新股票的資料**（約 1～2 分鐘），再過 1 分鐘網站更新。
移除股票時，舊的資料檔（`data/tw/代號.json`、`data/us/代號.json`）會留著但不再顯示，可以手動刪掉。

追蹤清單超過約 50 檔時，要留意 FinMind 免費額度（每檔台股每次用 5 次請求）與排程執行時間。

---

## 資料怎麼更新

GitHub Actions（`.github/workflows/update-data.yml`，名稱「更新股票資料」）自動執行：

| 時間（台灣） | 內容 |
|---|---|
| 週一～五 16:00 | 台股（FinMind） |
| 週二～六 06:00 | 美股（SEC 財報＋Yahoo Finance 股價） |
| 改了 `watchlist.json` 時 | 台股＋美股 |

有變更才會 commit（作者是 `github-actions[bot]`），Cloudflare 接著自動重新部署。抓取失敗時 GitHub 會寄信通知。

### 手動更新

**在 GitHub 網頁**：repo → **Actions** → 左側「更新股票資料」→ **Run workflow**（可選 all／tw／us）。

**在自己電腦**（需要 Python 3.11 以上）：

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_tw.py
python scripts/fetch_us.py
python scripts/build_summary.py
```

- 只更新某幾檔：`python scripts/fetch_tw.py 2330 6488`、`python scripts/fetch_us.py AAPL`
- 美股需要先設定環境變數 `SEC_USER_AGENT`（格式：`stock-dashboard 你的email`），否則 SEC 會拒絕連線。
- 台股可設定 `FINMIND_TOKEN`（不設也能跑，額度較少）。
- 本機預覽：`python -m http.server 8540`，開 http://localhost:8540

> **推送前先拉**：機器人每天會 commit 新資料，所以在 GitHub Desktop 要先 **Fetch origin → Pull origin**，再 Commit、Push。

### GitHub Secrets（repo → Settings → Secrets and variables → Actions）

| 名稱 | 用途 |
|---|---|
| `FINMIND_TOKEN` | FinMind API token（台股） |
| `SEC_USER_AGENT` | 送給 SEC 的聯絡資訊（美股） |

**任何 key 都不能寫進程式碼或 commit 進 repo。**

---

## 網站內容

| 頁面 | 內容 |
|---|---|
| `index.html` 首頁 | 報價列、每檔股票的卡片（收盤價、漲跌、近一年走勢） |
| `stock.html?symbol=2330` 個股頁 | 報價列、K 線＋技術指標、月營收（台股）、近 8 季營收／毛利率／營益率、EPS、股利、年報連結、TradingView 基本面與公司簡介 |
| `compare.html` 比較頁 | 所有股票的指標表，可排序、篩選台股／美股 |

**顏色：紅漲綠跌**（TradingView 嵌入的基本面、公司簡介元件除外）。

### K 線技術指標

- 主圖：MA 8／21／55／89（簡單均線，可個別開關）
- 成交量：均量 5／13／34（台股單位：張）
- **扣抵（動態）**：游標指到哪一天，就以那天為基準標出各均線、均量的扣抵 K 棒與扣抵價，下方扣抵表也跟著換
- 副圖：DMI 13（預設）／KD 9,3,3／MACD 12,26,9
- 設定記在瀏覽器裡

同一套指標的 TradingView 版本在 `tradingview/`（Pine Script v6，三支：主圖扣抵均線、成交量扣抵、DMI）。安裝：TradingView → Pine 編輯器 → 新建指標 → 貼上 → 儲存 → 加到圖表。

---

## 資料來源

| 資料 | 來源 |
|---|---|
| 台股日 K、月營收、季報、股利、本益比 | [FinMind](https://finmindtrade.com/)（整理自證交所、櫃買中心、公開資訊觀測站） |
| 台股年報 | 公開資訊觀測站 |
| 美股季報、10-K | SEC EDGAR |
| 美股日 K、本益比、股利 | Yahoo Finance（yfinance） |
| 基本面、公司簡介元件 | TradingView |

## 檔案結構

```
config/watchlist.json        追蹤清單（唯一需要手動維護的檔案）
data/tw/*.json, data/us/*.json  每檔股票的資料（排程產生）
data/summary.json            首頁、比較頁用的總表（排程產生）
data/stocklist.json          搜尋框用的全部台股、美股清單（排程產生）
functions/api/stock.js       Cloudflare Pages Function：即時查詢不在清單裡的股票
scripts/                     抓資料的 Python 程式
assets/                      網頁共用的 CSS、JavaScript（app、charts、indicators、widgets）
tradingview/                 TradingView 用的 Pine Script
.github/workflows/           自動排程
```
