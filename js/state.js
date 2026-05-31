/**
 * js/state.js
 *
 * Application state — portfolio, cash, and transaction history.
 * Persisted to localStorage automatically on every change.
 *
 * ── Shape ────────────────────────────────────────────────────
 *
 *  state = {
 *    cash:         number,          // available buying power
 *    holdings: {
 *      [symbol]: {
 *        qty:      number,          // shares owned
 *        avgCost:  number,          // average cost basis per share
 *      }
 *    },
 *    transactions: [                // newest first
 *      {
 *        type:   'buy' | 'sell',
 *        sym:    string,
 *        name:   string,
 *        qty:    number,
 *        price:  number,            // price per share at execution
 *        total:  number,            // qty * price
 *        date:   ISO string,
 *      }
 *    ],
 *  }
 */

const STORAGE_KEY     = 'papertrade_v1';
const STARTING_CASH   = 10_000;

// ── Live data cache (not persisted) ─────────────────────────
let liveData     = {};   // { [sym]: { price, change, changePct, … } }
let modalSymbol  = null; // currently open stock in the modal
let currentSector = 'All';
let chartDataCache = {}; // { [`${sym}_${range}`]: [{t, p}] }

// ── Portfolio state ──────────────────────────────────────────
let state = {
  cash:         STARTING_CASH,
  holdings:     {},
  transactions: [],
};

/**
 * Load state from localStorage.
 * Called once at startup; silently falls back to defaults on parse error.
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.cash === 'number') {
        state = parsed;
      }
    }
  } catch (e) {
    console.warn('[state] Could not load saved state:', e);
  }
}

/**
 * Persist current state to localStorage.
 */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[state] Could not save state:', e);
  }
}

/**
 * Hard reset — wipe everything back to a fresh account.
 * Asks for confirmation first.
 */
function resetState() {
  if (!confirm('Reset your portfolio? This cannot be undone.')) return;
  state = { cash: STARTING_CASH, holdings: {}, transactions: [] };
  chartDataCache = {};
  saveState();
  updateCashDisplay();
  renderPortfolio();
  renderHistory();
  showToast('Portfolio reset to $' + STARTING_CASH.toLocaleString());
}

// ── Trade execution ──────────────────────────────────────────

/**
 * Buy shares of a symbol.
 * Deducts cash and updates the holdings cost basis.
 *
 * @param {string} sym
 * @param {number} qty
 * @returns {{ ok: boolean, message: string }}
 */
function buyShares(sym, qty) {
  const data  = liveData[sym];
  if (!data || !data.price) return { ok: false, message: 'Price unavailable — try refreshing.' };

  const price = data.price;
  const total = price * qty;

  if (total > state.cash) {
    return { ok: false, message: `Need ${fmt(total)} but only ${fmt(state.cash)} available.` };
  }

  // Update holdings with a blended average cost
  const h      = state.holdings[sym] || { qty: 0, avgCost: 0 };
  const newQty = h.qty + qty;
  const newAvg = (h.qty * h.avgCost + qty * price) / newQty;

  state.holdings[sym] = { qty: newQty, avgCost: newAvg };
  state.cash          -= total;

  state.transactions.unshift({
    type:  'buy',
    sym,
    name:  stockName(sym),
    qty,
    price,
    total,
    date:  new Date().toISOString(),
  });

  saveState();
  return { ok: true, message: `Bought ${qty} ${sym} @ ${fmt(price)}` };
}

/**
 * Sell shares of a symbol.
 * Adds proceeds to cash and reduces (or removes) the holding.
 *
 * @param {string} sym
 * @param {number} qty
 * @returns {{ ok: boolean, message: string }}
 */
function sellShares(sym, qty) {
  const data = liveData[sym];
  if (!data || !data.price) return { ok: false, message: 'Price unavailable — try refreshing.' };

  const h = state.holdings[sym];
  if (!h || h.qty < qty) {
    return { ok: false, message: `You only own ${h ? h.qty : 0} shares.` };
  }

  const price = data.price;
  const total = price * qty;

  h.qty -= qty;
  if (h.qty === 0) delete state.holdings[sym];

  state.cash += total;

  state.transactions.unshift({
    type:  'sell',
    sym,
    name:  stockName(sym),
    qty,
    price,
    total,
    date:  new Date().toISOString(),
  });

  saveState();
  return { ok: true, message: `Sold ${qty} ${sym} @ ${fmt(price)}` };
}

// ── Helpers ──────────────────────────────────────────────────

function stockName(sym) {
  return (STOCK_LIST.find(s => s.sym === sym) || {}).name || sym;
}

function fmt(n, decimals = 2) {
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits:  decimals,
    maximumFractionDigits:  decimals,
  });
}

function fmtPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtChg(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}
