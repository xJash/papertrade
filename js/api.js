/**
 * js/api.js
 *
 * All market data fetching — talks to local server.py (localhost:5500).
 *
 * Endpoints:
 *   GET /api/stocks                              → full dynamic stock list
 *   GET /api/quotes?symbols=AAPL,MSFT,...        → live prices
 *   GET /api/history?symbol=AAPL&period=1d&interval=5m → OHLC history
 *
 * To change the data source, edit server.py — this file only handles
 * HTTP calls and doesn't care where server.py gets its data.
 */

const API_BASE = 'http://localhost:5500';

/**
 * Timeframe configs for the chart modal buttons.
 * period/interval must be valid yfinance values (see server.py docstring).
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
 * Fetch the full stock list from the server.
 * Returns [{ sym, name, sector }, ...]
 * The server builds this dynamically from NASDAQ/NYSE data at startup.
 */
async function fetchStockList() {
  try {
    const resp = await fetch(`${API_BASE}/api/stocks`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('[api] fetchStockList failed:', err.message);
    return [];
  }
}

/**
 * Fetch live quotes for a batch of symbols.
 * Returns { [sym]: { price, change, changePct, prevClose, volume, marketCap } }
 */
async function fetchQuoteBatch(symbols) {
  if (!symbols.length) return {};
  try {
    const resp = await fetch(`${API_BASE}/api/quotes?symbols=${symbols.join(',')}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn('[api] fetchQuoteBatch failed:', err.message);
    return {};
  }
}

/**
 * Fetch live quotes for the entire STOCK_LIST sequentially in batches.
 * Sequential (not parallel) so we don't fire 60+ requests at once and
 * trigger Yahoo's rate limiter. The server caches results for 60s so
 * repeat calls within that window are instant.
 */
async function fetchAllQuotes() {
  const symbols = STOCK_LIST.map(s => s.sym);
  const BATCH   = 100;
  const result  = {};

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const data  = await fetchQuoteBatch(batch);
    Object.assign(result, data);
    // Tiny yield to keep the UI thread responsive between batches
    await new Promise(r => setTimeout(r, 30));
  }
  return result;
}

/**
 * Fetch prices only for the symbols currently visible in the market grid.
 * Used on initial load so the first paint is fast — background refresh
 * fills in the rest via fetchAllQuotes().
 */
async function fetchVisibleQuotes() {
  const visible = Array.from(document.querySelectorAll('.stock-card'))
    .map(el => el.dataset.sym)
    .filter(Boolean);
  if (!visible.length) return {};
  return fetchQuoteBatch(visible);
}

/**
 * Fetch OHLC close history for one symbol.
 * Returns [{ t: ms_timestamp, p: close_price }, ...] or null on failure.
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
