/**
 * js/app.js
 *
 * Application entry point.
 * Fetches the dynamic stock list from the server, then initialises the UI.
 */

const REFRESH_INTERVAL_MS = 60_000;  // live price refresh rate

// Global stock list — populated from /api/stocks at startup.
// All other modules reference this.
let STOCK_LIST = [];

/**
 * Refresh all live prices then re-render dependent views.
 */
async function refreshPrices() {
  liveData = await fetchAllQuotes();
  renderTicker();
  filterStocks();
  renderPortfolio();
}

/**
 * Boot sequence.
 */
async function init() {
  loadState();
  updateCashDisplay();

  // Show a loading state in the grid while we fetch
  document.getElementById('stockGrid').innerHTML =
    '<div class="empty-state">Connecting to server — make sure server.py is running…</div>';
  document.getElementById('stockCount').textContent = 'Loading…';

  // 1. Fetch dynamic stock list from server
  STOCK_LIST = await fetchStockList();

  if (!STOCK_LIST.length) {
    document.getElementById('stockGrid').innerHTML =
      `<div class="empty-state" style="color:var(--red)">
        ⚠ Could not load stock list.<br><br>
        Make sure <strong>server.py</strong> is running:<br>
        <code style="font-family:var(--font-mono);font-size:12px;color:var(--text2)">python server.py</code>
       </div>`;
    document.getElementById('stockCount').textContent = 'Offline';
    return;
  }

  // 2. Build UI (sector filters, grid skeleton)
  renderMarket();

  // 3. Fetch live prices
  await refreshPrices();

  // 4. Auto-refresh
  setInterval(refreshPrices, REFRESH_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', init);
