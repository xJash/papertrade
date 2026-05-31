/**
 * js/api.js
 *
 * All market data fetching.
 * Talks to the local Python server (server.py) which proxies Yahoo Finance.
 *
 * ── How it works ─────────────────────────────────────────────
 *  Browser → GET /api/quotes?symbols=AAPL,MSFT   → server.py → Yahoo Finance
 *  Browser → GET /api/history?symbol=AAPL&period=1d&interval=5m → server.py → Yahoo
 *
 * ── Changing the data source ─────────────────────────────────
 *  Everything Yahoo-specific lives in server.py.
 *  This file only cares about the JSON shape those endpoints return.
 *  See README.md for details on swapping to Alpha Vantage, Polygon, etc.
 */

const API_BASE = 'http://localhost:5500';

/**
 * Timeframe configs for the chart buttons.
 * period/interval must be valid yfinance (Yahoo Finance) values.
 *
 * Valid periods:   1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max
 * Valid intervals: 1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo
 * (intraday intervals only available for periods ≤ 60 days)
 */
const TIMEFRAMES = [
  { label: '24h',  period: '1d',   interval: '5m'  },
  { label: '2d',   period: '2d',   interval: '15m' },
  { label: '3d',   period: '3d',   interval: '30m' },
  { label: '5d',   period: '5d',   interval: '1h'  },
  { label: '7d',   period: '7d',   interval: '1h'  },
  { label: '14d',  period: '14d',  interval: '1d'  },
  { label: '28d',  period: '1mo',  interval: '1d'  },
  { label: '3mo',  period: '3mo',  interval: '1d'  },
  { label: '6mo',  period: '6mo',  interval: '1d'  },
];

/**
 * Fetch live quotes for a batch of symbols (up to ~50 at once is fine).
 * Returns { [sym]: { price, change, changePct, prevClose, volume, marketCap } }
 *
 * @param {string[]} symbols
 * @returns {Promise<Object>}
 */
async function fetchQuoteBatch(symbols) {
  if (!symbols.length) return {};
  try {
    const url  = `${API_BASE}/api/quotes?symbols=${symbols.join(',')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn('[api] fetchQuoteBatch failed:', err.message);
    return {};
  }
}

/**
 * Fetch quotes for the entire STOCK_LIST in parallel batches of 50.
 * Returns the merged result map.
 *
 * @returns {Promise<Object>}
 */
async function fetchAllQuotes() {
  const symbols = STOCK_LIST.map(s => s.sym);
  const BATCH   = 50;
  const batches = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    batches.push(symbols.slice(i, i + BATCH));
  }

  // Fire all batches concurrently
  const results = await Promise.all(batches.map(b => fetchQuoteBatch(b)));
  return Object.assign({}, ...results);
}

/**
 * Fetch OHLC close history for one symbol.
 * Returns [{ t: ms_timestamp, p: close_price }, ...] or null on failure.
 *
 * @param {string} symbol
 * @param {string} period    — yfinance period string, e.g. '1d'
 * @param {string} interval  — yfinance interval string, e.g. '5m'
 * @returns {Promise<Array|null>}
 */
async function fetchHistory(symbol, period, interval) {
  try {
    const url  = `${API_BASE}/api/history?symbol=${symbol}&period=${period}&interval=${interval}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return json.points || null;
  } catch (err) {
    console.warn(`[api] fetchHistory(${symbol}) failed:`, err.message);
    return null;
  }
}
