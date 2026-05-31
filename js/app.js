/**
 * js/app.js
 *
 * Application entry point.
 * Initializes state, triggers the first data fetch, and sets up
 * the auto-refresh interval.
 */

/** How often to refresh live prices (milliseconds). Default: 60 seconds. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Refresh all live prices, then re-render anything that depends on them.
 */
async function refreshPrices() {
  liveData = await fetchAllQuotes();
  renderTicker();
  filterStocks();       // redraw market grid with latest prices
  renderPortfolio();    // update G/L numbers if portfolio page is open
}

/**
 * Boot sequence.
 */
async function init() {
  loadState();           // restore saved portfolio from localStorage
  updateCashDisplay();   // show cash in header immediately

  renderMarket();        // build sector filters & grid skeleton

  // Fetch live data (this takes a moment)
  await refreshPrices();

  // Auto-refresh every minute
  setInterval(refreshPrices, REFRESH_INTERVAL_MS);
}

// Kick everything off when the DOM is ready
document.addEventListener('DOMContentLoaded', init);
