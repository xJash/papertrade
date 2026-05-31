/**
 * js/api.js
 *
 * All Yahoo Finance data fetching.
 *
 * Yahoo Finance doesn't have an official public API, so we route
 * requests through allorigins.win (a free CORS proxy) to avoid
 * CORS errors when running locally.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  WANT TO SWAP THE DATA SOURCE?                           │
 * │                                                          │
 * │  Replace fetchQuoteBatch() and fetchHistory() with calls │
 * │  to any API you prefer, e.g.:                           │
 * │    • Alpha Vantage  (free tier, needs API key)           │
 * │    • Polygon.io     (free tier, needs API key)           │
 * │    • Finnhub        (free tier, needs API key)           │
 * │    • A local Python server (see README.md)               │
 * └──────────────────────────────────────────────────────────┘
 */

const CORS_PROXY = 'https://api.allorigins.win/get?url=';

/**
 * Fetch live quotes for up to 10 symbols at once.
 * Returns an object keyed by symbol: { price, change, changePct, prevClose, volume, marketCap }
 *
 * @param {string[]} symbols
 * @returns {Promise<Object>}
 */
async function fetchQuoteBatch(symbols) {
  if (!symbols.length) return {};

  const fields = [
    'regularMarketPrice',
    'regularMarketChange',
    'regularMarketChangePercent',
    'regularMarketPreviousClose',
    'regularMarketVolume',
    'marketCap',
  ].join(',');

  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=${fields}`;

  try {
    const resp = await fetch(CORS_PROXY + encodeURIComponent(yahooUrl));
    const json = await resp.json();
    const data = JSON.parse(json.contents);
    const results = {};

    (data?.quoteResponse?.result || []).forEach(q => {
      results[q.symbol] = {
        price:     q.regularMarketPrice            ?? 0,
        change:    q.regularMarketChange           ?? 0,
        changePct: q.regularMarketChangePercent    ?? 0,
        prevClose: q.regularMarketPreviousClose    ?? 0,
        volume:    q.regularMarketVolume           ?? 0,
        marketCap: q.marketCap                     ?? 0,
      };
    });

    return results;
  } catch (err) {
    console.warn('[api] fetchQuoteBatch failed:', err);
    return {};
  }
}

/**
 * Fetch all live quotes for the full STOCK_LIST in parallel batches of 10.
 * Populates the global `liveData` map.
 *
 * @returns {Promise<Object>}
 */
async function fetchAllQuotes() {
  const symbols = STOCK_LIST.map(s => s.sym);
  const batches  = [];
  for (let i = 0; i < symbols.length; i += 10) {
    batches.push(symbols.slice(i, i + 10));
  }

  const results = await Promise.all(batches.map(b => fetchQuoteBatch(b)));
  return Object.assign({}, ...results);
}

/**
 * Timeframe configurations for the chart.
 * label     — shown on the button
 * range     — Yahoo Finance range param  (1d, 5d, 1mo, 3mo, 6mo, 1y…)
 * interval  — Yahoo Finance interval     (1m, 5m, 15m, 30m, 1h, 1d…)
 */
const TIMEFRAMES = [
  { label: '24h',  range: '1d',   interval: '5m'  },
  { label: '2d',   range: '2d',   interval: '15m' },
  { label: '3d',   range: '3d',   interval: '30m' },
  { label: '5d',   range: '5d',   interval: '1h'  },
  { label: '7d',   range: '7d',   interval: '1h'  },
  { label: '14d',  range: '14d',  interval: '1d'  },
  { label: '28d',  range: '1mo',  interval: '1d'  },
  { label: '3mo',  range: '3mo',  interval: '1d'  },
  { label: '6mo',  range: '6mo',  interval: '1d'  },
];

/**
 * Fetch OHLC history for a single symbol.
 * Returns an array of { t: timestamp_ms, p: close_price } objects,
 * or null on failure.
 *
 * @param {string} symbol
 * @param {string} range    — e.g. '1d', '3mo'
 * @param {string} interval — e.g. '5m', '1d'
 * @returns {Promise<Array|null>}
 */
async function fetchHistory(symbol, range, interval) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;

  try {
    const resp = await fetch(CORS_PROXY + encodeURIComponent(yahooUrl));
    const json = await resp.json();
    const data = JSON.parse(json.contents);
    const result = data?.chart?.result?.[0];

    if (!result) return null;

    const timestamps = result.timestamp;
    const closes     = result.indicators?.quote?.[0]?.close;

    if (!timestamps || !closes) return null;

    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        points.push({ t: timestamps[i] * 1000, p: closes[i] });
      }
    }
    return points;
  } catch (err) {
    console.warn(`[api] fetchHistory(${symbol}) failed:`, err);
    return null;
  }
}
