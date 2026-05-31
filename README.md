# PaperTrade — Stock Simulator

A browser-based paper trading simulator with live USA stock prices, full portfolio
tracking, and persistent storage. No build step required — just open in a browser.

---

## Quick Start

### Option A — VS Code + Live Server (recommended)
1. Open `papertrade.code-workspace` in VS Code
2. Install the **Live Server** extension (recommended in the workspace)
3. Right-click `index.html` → **Open with Live Server**
4. Browser opens at `http://127.0.0.1:5500`

### Option B — Any local HTTP server
```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080
```

> ⚠️  **Do not open index.html directly as a file:// URL.**
> The CORS proxy calls require HTTP, not the file protocol.

---

## Project Structure

```
papertrade/
├── index.html                  # Entry point — HTML shell
├── papertrade.code-workspace   # VS Code workspace
├── README.md
│
├── css/
│   └── main.css                # All styles (design tokens at the top)
│
├── data/
│   └── stocks.js               # Master list of symbols — edit this to add tickers
│
└── js/
    ├── api.js       # Yahoo Finance fetching (swap this to change data source)
    ├── state.js     # Portfolio state + buy/sell logic + localStorage persistence
    ├── ui.js        # Market grid, portfolio, history, ticker rendering
    ├── chart.js     # Chart.js price chart (timeframes)
    ├── modal.js     # Stock detail modal + trade panel
    └── app.js       # Boot sequence + auto-refresh
```

---

## How to Extend

### Add more stocks
Edit `data/stocks.js` — copy any existing entry and change `sym`, `name`, and `sector`.
The sym must match Yahoo Finance exactly (e.g. `BRK-B`, not `BRK.B`).

### Change starting cash
In `js/state.js`, change `STARTING_CASH`:
```js
const STARTING_CASH = 50_000; // change to whatever you want
```
Note: this only affects NEW saves. To reset your existing portfolio, open the browser
console and run `resetState()`.

### Change the refresh rate
In `js/app.js`:
```js
const REFRESH_INTERVAL_MS = 30_000; // 30 seconds instead of 60
```

### Add a new timeframe
In `js/api.js`, add an entry to the `TIMEFRAMES` array:
```js
{ label: '1y', range: '1y', interval: '1wk' },
```
Valid Yahoo Finance range values: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
Valid interval values: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo

### Swap the data source
Everything that touches Yahoo Finance is isolated in `js/api.js`.
Replace `fetchQuoteBatch()` and `fetchHistory()` with calls to any other API
(Alpha Vantage, Polygon.io, Finnhub, your own backend, etc.) — the rest of the
app just consumes the same shape of data.

For example, with Alpha Vantage (free tier, 25 req/day):
```js
// In api.js — replace fetchQuoteBatch
async function fetchQuoteBatch(symbols) {
  const API_KEY = 'YOUR_KEY_HERE';
  const results = {};
  for (const sym of symbols) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${API_KEY}`;
    const resp = await fetch(url);
    const json = await resp.json();
    const q    = json['Global Quote'];
    results[sym] = {
      price:     parseFloat(q['05. price']),
      change:    parseFloat(q['09. change']),
      changePct: parseFloat(q['10. change percent']),
      prevClose: parseFloat(q['08. previous close']),
      volume:    parseInt(q['06. volume']),
      marketCap: 0,
    };
  }
  return results;
}
```

### Add dark/light mode toggle
All colors are CSS custom properties in `css/main.css` under `:root`.
Add a `[data-theme="light"]` block with overrides, then toggle
`document.documentElement.dataset.theme` from a button.

### Add price alerts
In `js/state.js`, add an `alerts` array to the state shape:
```js
alerts: [{ sym: 'AAPL', condition: 'above', price: 200 }]
```
Then in `refreshPrices()` in `js/app.js`, loop through alerts after
fetching and call `showToast()` when triggered.

### Reset / wipe portfolio
Open the browser console (F12) and run:
```js
resetState()
```
Or add a reset button to the UI that calls `resetState()`.

---

## Data Notes

- Prices are fetched from Yahoo Finance via a public CORS proxy (`allorigins.win`).
- The proxy adds ~200–400ms latency. If it's down, prices show `—`.
- Yahoo Finance rate-limits aggressive polling — the 60-second refresh is safe.
- After-hours and pre-market prices are included when markets are closed.
- The sparklines on stock cards are decorative (trend-biased random) — only the
  modal chart shows real historical data.

---

## Persistence

Your portfolio is saved to `localStorage` automatically on every trade.
It survives browser restarts and tab closes.

To back up your portfolio, open the console and run:
```js
copy(localStorage.getItem('papertrade_v1'))
```
Then paste somewhere safe. To restore, run:
```js
localStorage.setItem('papertrade_v1', '<paste here>')
location.reload()
```
