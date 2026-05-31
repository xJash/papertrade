/**
 * js/modal.js
 *
 * Stock detail modal: price info, charts, and trade execution.
 */

/**
 * Open the stock detail modal for a given symbol.
 * @param {string} sym
 */
async function openModal(sym) {
  modalSymbol = sym;

  const stock = STOCK_LIST.find(s => s.sym === sym) || {};
  const d     = liveData[sym];
  const price = d?.price    ?? 0;
  const chg   = d?.change   ?? 0;
  const chgPct= d?.changePct?? 0;
  const cls   = chg >= 0 ? 'up' : 'dn';

  const holding  = state.holdings[sym];
  const owned    = holding?.qty      ?? 0;
  const avgCost  = holding?.avgCost  ?? 0;
  const gl       = owned > 0 ? (price - avgCost) * owned : 0;
  const glPct    = owned > 0 && avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

  // ── Build timeframe buttons ──
  const tfButtons = TIMEFRAMES.map((tf, i) =>
    `<button class="tf-btn${i === 0 ? ' active' : ''}"
       onclick="loadChart('${sym}','${tf.range}','${tf.interval}',this)">${tf.label}</button>`
  ).join('');

  // ── Owned badge ──
  const ownedBadge = owned > 0
    ? `<div class="owned-badge">
         ${owned} share${owned !== 1 ? 's' : ''} owned
         · avg ${fmt(avgCost)}
         · G/L: <span class="${gl >= 0 ? 'up' : 'dn'}">${fmt(gl)} (${fmtPct(glPct)})</span>
       </div>`
    : '';

  // ── Volume / market cap extra info ──
  const extras = d
    ? `<div style="display:flex;gap:20px;font-family:var(--font-mono);font-size:11px;color:var(--text3);margin:6px 0 16px">
         <span>Vol: ${(d.volume / 1_000_000).toFixed(1)}M</span>
         ${d.marketCap ? `<span>Mkt cap: $${(d.marketCap / 1_000_000_000).toFixed(1)}B</span>` : ''}
         <span>Prev close: ${fmt(d.prevClose)}</span>
       </div>`
    : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <div class="modal-sym">${sym}</div>
        <div class="modal-name">${stock.name || ''}</div>
      </div>
      <button class="close-btn" onclick="closeModal()">✕ close</button>
    </div>

    <div class="modal-price-row">
      <div class="modal-price ${cls}">${fmt(price)}</div>
      <div class="modal-chg  ${cls}">${(chg >= 0 ? '+' : '') + chg.toFixed(2)} (${fmtPct(chgPct)})</div>
    </div>
    ${extras}
    ${ownedBadge}

    <div class="timeframe-row" id="tfRow">${tfButtons}</div>
    <div class="chart-wrap"><canvas id="mainChart"></canvas></div>

    <div class="trade-panel">
      <h3>Trade ${sym}</h3>
      ${ownedBadge}
      <div class="trade-row">
        <label for="tradeQty">Shares</label>
        <input type="number" id="tradeQty" value="1" min="1" step="1" oninput="updateTradeInfo()">
      </div>
      <div class="trade-info" id="tradeInfo">
        ${price ? `${fmt(price)} × 1 = ${fmt(price)}` : 'Fetching price…'}
      </div>
      <div class="trade-btns">
        <button class="buy-btn"  onclick="executeTrade('buy')">Buy</button>
        <button class="sell-btn" onclick="executeTrade('sell')">Sell</button>
      </div>
    </div>`;

  document.getElementById('stockModal').classList.add('open');

  // Load chart with default timeframe
  loadChart(sym, TIMEFRAMES[0].range, TIMEFRAMES[0].interval, null);
}

/**
 * Update the trade cost preview as the user changes quantity.
 */
function updateTradeInfo() {
  const qty  = parseInt(document.getElementById('tradeQty')?.value) || 1;
  const d    = liveData[modalSymbol];
  if (!d) return;

  const total = d.price * qty;
  document.getElementById('tradeInfo').textContent =
    `${fmt(d.price)} × ${qty} = ${fmt(total)}  ·  Cash: ${fmt(state.cash)}`;
}

/**
 * Execute a buy or sell trade for the currently open modal symbol.
 * @param {'buy'|'sell'} type
 */
function executeTrade(type) {
  const qty = parseInt(document.getElementById('tradeQty')?.value) || 0;
  if (qty <= 0) { showToast('Enter a valid quantity.'); return; }

  const result = type === 'buy'
    ? buyShares(modalSymbol, qty)
    : sellShares(modalSymbol, qty);

  showToast(result.message);

  if (result.ok) {
    updateCashDisplay();
    openModal(modalSymbol); // re-render with updated state
  }
}

/**
 * Close the modal overlay.
 * Accepts a MouseEvent so we can check for backdrop clicks,
 * or call with no args to force-close.
 */
function handleModalClick(event) {
  if (event.target.id === 'stockModal') closeModal();
}

function closeModal() {
  document.getElementById('stockModal').classList.remove('open');
  destroyChart();
  modalSymbol = null;
}
