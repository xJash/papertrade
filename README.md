# PaperTrade — Stock Simulator

A browser-based paper trading simulator with live USA stock prices (~440 tickers),
full portfolio tracking, and persistent localStorage saves.

---

## Setup (one time)

### 1. Install Python dependencies
```bash
pip install yfinance flask
```
> Python 3.9+ required. `yfinance` handles all Yahoo Finance auth automatically.

### 2. Start the local server
```bash
python server.py
```
You'll see:
```
  ╔══════════════════════════════════════════╗
  ║        PaperTrade local server           ║
  ║  http://localhost:5500                   ║
  ╚══════════════════════════════════════════╝
```

### 3. Open the app
Visit **http://localhost:5500** in your browser.

> ⚠️  Always use `python server.py` — do NOT open index.html as a file:// URL.
> The browser talks to the Python server for all price data.

---

## Daily use
```bash
python server.py   # start
# open http://localhost:5500
# Ctrl+C to stop
```

---

## Project Structure
```
papertrade/
├── server.py                   ← Python server (Flask + yfinance). Run this.
├── index.html                  ← App shell
├── papertrade.code-workspace   ← Open in VS Code
├── README.md
├── css/
│   └── main.css                ← All styles. Design tokens at the top.
├── data/
│   └── stocks.js               ← ~440 tickers. Add any Yahoo Finance symbol here.
└── js/
    ├── api.js      ← Talks to localhost:5500/api/... (swap server to change data source)
    ├── state.js    ← Portfolio state, buy/sell logic, localStorage persistence
    ├── ui.js       ← Market grid, portfolio page, history page, ticker tape
    ├── chart.js    ← Chart.js price charts + timeframe rendering
    ├── modal.js    ← Stock detail modal + trade panel
    └── app.js      ← Boot sequence, auto-refresh every 60s
```

---

## How to extend

### Add more stocks
Edit `data/stocks.js`. The `sym` must be a valid Yahoo Finance ticker.
```js
{ sym: 'SMCI', name: 'Super Micro Computer', sector: 'Tech' },
```
Any new sector you add automatically gets a filter button.

### Change starting cash
In `js/state.js`:
```js
const STARTING_CASH = 25_000;
```
Reset your existing portfolio from the browser console: `resetState()`

### Change refresh interval
In `js/app.js`:
```js
const REFRESH_INTERVAL_MS = 30_000; // every 30 seconds
```

### Add a new timeframe
In `js/api.js`, add to the `TIMEFRAMES` array:
```js
{ label: '1y', period: '1y', interval: '1wk' },
```

### Add price alerts
In `js/state.js`, add to the state shape:
```js
alerts: [{ sym: 'NVDA', condition: 'above', price: 150 }]
```
Then in `js/app.js` inside `refreshPrices()`, loop through alerts and call `showToast()`.

### Swap to a different data source
Everything Yahoo-specific is in `server.py` — just replace the `get_quotes()` and
`get_history()` functions. The JS only cares that the endpoints return:
- `/api/quotes` → `{ AAPL: { price, change, changePct, prevClose, volume, marketCap }, ... }`
- `/api/history` → `{ symbol, points: [{t: ms, p: price}, ...] }`

---

## Saving / backing up your portfolio

Your portfolio is auto-saved to `localStorage`. To back it up, open the browser
console (F12) and run:
```js
copy(localStorage.getItem('papertrade_v1'))
```
Paste somewhere safe. To restore:
```js
localStorage.setItem('papertrade_v1', '<paste>')
location.reload()
```

To wipe and start fresh, run `resetState()` in the console.
