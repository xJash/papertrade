# PaperTrade — Stock Simulator

A browser-based paper trading simulator with **live USA stock prices** and a
**fully dynamic stock list** (~3,000+ tickers, refreshed on every server start).

---

## Setup (one time)

### 1. Install Python dependencies
```bash
pip install yfinance requests
```
Python 3.9+ required.

### 2. Start the server
```bash
python server.py
```
On first run you'll see it fetching the stock list:
```
[stocks] Fetching dynamic stock list…
  fetched 4,165 entries from nasdaq_full_tickers.json
  fetched 2,706 entries from nyse_full_tickers.json
  fetched 503 S&P 500 sector mappings
[stocks] Final list: 3,136 stocks across 12 sectors

  ╔═══════════════════════════════════════════════════╗
  ║  3,136 stocks loaded — http://localhost:5500      ║
  ╚═══════════════════════════════════════════════════╝
```

### 3. Open the app
**http://localhost:5500**

> ⚠️  Always run via `python server.py` — don't open index.html as a file:// URL.

---

## Daily use
```bash
python server.py    # start (fetches fresh stock list every time)
# Ctrl+C to stop
```

---

## How the stock list works

On every server start, `server.py` fetches fresh data from two GitHub-hosted
sources (no API key needed):

| Source | What it provides |
|---|---|
| `rreichel3/US-Stock-Symbols` (NASDAQ + NYSE JSON) | Symbol, full name, sector, market cap |
| `datasets/s-and-p-500-companies` (CSV) | More accurate GICS sector labels for S&P 500 members |

Then applies filters:
- **Market cap > $100M** — removes shells, SPACs, micro-caps
- **US-listed only** — removes most foreign-only ADRs (S&P 500 ADRs kept)
- **Clean symbols only** — removes warrants (`W`), rights (`R`), units (`U`)
- **Deduped** by symbol, sorted by market cap descending

Result: ~3,000–3,200 real, tradeable US stocks.

To change the minimum market cap threshold, edit `server.py`:
```python
MIN_MARKET_CAP = 500_000_000   # raise to $500M to get ~1,700 larger companies
```

---

## Project structure
```
papertrade/
├── server.py          ← Run this. Fetches stock list + proxies Yahoo Finance.
├── index.html         ← App shell
├── README.md
├── css/main.css       ← All styles. Design tokens at top.
├── data/stocks.js     ← No longer used (list is dynamic). Can delete.
└── js/
    ├── api.js         ← HTTP calls to localhost:5500/api/...
    ├── state.js       ← Portfolio state, buy/sell, localStorage
    ├── ui.js          ← Rendering: market grid, portfolio, history
    ├── chart.js       ← Chart.js price charts
    ├── modal.js       ← Stock detail modal + trade panel
    └── app.js         ← Boot: loads stock list, then starts the app
```

---

## Extending

### Change starting cash
In `js/state.js`: `const STARTING_CASH = 25_000;`
Reset via browser console: `resetState()`

### Add a custom timeframe
In `js/api.js`, add to `TIMEFRAMES`:
```js
{ label: '1y', period: '1y', interval: '1wk' },
```

### Change market cap filter
In `server.py`: `MIN_MARKET_CAP = 1_000_000_000`  (only $1B+ companies)

### Add price alerts
In `js/state.js`, add `alerts: []` to the state shape, then check them
in `refreshPrices()` in `js/app.js` and call `showToast()`.

### Backup your portfolio
Browser console (F12):
```js
copy(localStorage.getItem('papertrade_v1'))   // copy to clipboard
// restore:
localStorage.setItem('papertrade_v1', '<paste>'); location.reload();
// wipe:
resetState()
```
