/**
 * js/ui.js
 *
 * All DOM rendering: market grid, portfolio, history, ticker.
 * Separated from state so each piece is easy to extend.
 */

// ── Page navigation ──────────────────────────────────────────

function showPage(name, btnEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  // Lazy render on tab switch
  if (name === 'portfolio') renderPortfolio();
  if (name === 'history')   renderHistory();
}

// ── Cash display ─────────────────────────────────────────────

function updateCashDisplay() {
  document.getElementById('cashDisplay').textContent = fmt(state.cash);
}

// ── Ticker tape ──────────────────────────────────────────────

function renderTicker() {
  const sample = STOCK_LIST.slice(0, 20);
  const items  = sample.map(s => {
    const d = liveData[s.sym];
    if (!d) return `<span class="ticker-item"><span class="sym">${s.sym}</span>—</span>`;
    const cls = d.change >= 0 ? 'up' : 'dn';
    return `<span class="ticker-item">
      <span class="sym">${s.sym}</span>
      <span class="${cls}">${fmt(d.price)} ${fmtPct(d.changePct)}</span>
    </span>`;
  }).join('');

  // Duplicate so the loop is seamless
  document.getElementById('tickerInner').innerHTML = items + items;
}

// ── Market page ───────────────────────────────────────────────

function renderMarket() {
  buildSectorFilters();
  document.getElementById('stockCount').textContent = STOCK_LIST.length + ' stocks';
  filterStocks();
}

function buildSectorFilters() {
  const container = document.getElementById('sectorFilters');
  if (container.children.length > 0) return; // already built

  const sectors = ['All', ...new Set(STOCK_LIST.map(s => s.sector))];
  sectors.forEach(sec => {
    const btn = document.createElement('button');
    btn.className   = 'filter-btn' + (sec === 'All' ? ' active' : '');
    btn.textContent = sec;
    btn.onclick     = () => {
      currentSector = sec;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterStocks();
    };
    container.appendChild(btn);
  });
}

function filterStocks() {
  const q    = document.getElementById('searchInput').value.toLowerCase();
  let   list = STOCK_LIST;

  if (currentSector !== 'All') list = list.filter(s => s.sector === currentSector);
  if (q)                       list = list.filter(s =>
    s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  );

  const grid = document.getElementById('stockGrid');

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">No stocks match that search.</div>';
    return;
  }

  grid.innerHTML = list.map(s => {
    const d   = liveData[s.sym];
    const cls = d && d.change >= 0 ? 'up' : 'dn';
    return `
      <div class="stock-card" onclick="openModal('${s.sym}')">
        <div class="sym">${s.sym}</div>
        <div class="name">${s.name}</div>
        <div class="price ${cls}">${d ? fmt(d.price) : '—'}</div>
        <div class="chg  ${cls}">${d ? fmtPct(d.changePct) : ''}</div>
        <canvas class="mini-spark" id="spark-${s.sym}" width="160" height="28"></canvas>
      </div>`;
  }).join('');

  list.forEach(s => drawSparkline(s.sym));
}

/**
 * Draw a tiny trend sparkline on a canvas element.
 * Uses a randomly-generated shape biased by the day's direction —
 * replace with real intraday data if you want precision here.
 */
function drawSparkline(sym) {
  const canvas = document.getElementById('spark-' + sym);
  if (!canvas) return;
  const d = liveData[sym];
  if (!d) return;

  const ctx   = canvas.getContext('2d');
  const w     = canvas.width;
  const h     = canvas.height;
  const trend = d.changePct >= 0 ? 1 : -1;

  ctx.clearRect(0, 0, w, h);

  const pts   = 14;
  const points = [];
  let   y      = h / 2;

  for (let i = 0; i < pts; i++) {
    y += (Math.random() - 0.45) * trend * 2.2;
    y  = Math.max(2, Math.min(h - 2, y));
    points.push({ x: (i / (pts - 1)) * w, y });
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

  ctx.strokeStyle = trend >= 0 ? '#00d17a' : '#ff4d6a';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

// ── Portfolio page ────────────────────────────────────────────

function renderPortfolio() {
  const entries = Object.entries(state.holdings);

  // ── Summary stats ──
  let stockValue = 0;
  let costBasis  = 0;

  entries.forEach(([sym, h]) => {
    const price = liveData[sym]?.price ?? h.avgCost;
    stockValue += price * h.qty;
    costBasis  += h.avgCost * h.qty;
  });

  const totalEquity = state.cash + stockValue;
  const gl          = stockValue - costBasis;
  const glPct       = costBasis > 0 ? (gl / costBasis) * 100 : 0;

  document.getElementById('portfolioSummary').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Equity</div>
      <div class="stat-val">${fmt(totalEquity)}</div>
      <div class="stat-sub" style="color:var(--text3)">Cash + Holdings</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Cash</div>
      <div class="stat-val">${fmt(state.cash)}</div>
      <div class="stat-sub" style="color:var(--text3)">Available</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Unrealized G/L</div>
      <div class="stat-val ${gl >= 0 ? 'up' : 'dn'}">${fmt(gl)}</div>
      <div class="stat-sub ${gl >= 0 ? 'up' : 'dn'}">${fmtPct(glPct)}</div>
    </div>`;

  // ── Holdings list ──
  const container = document.getElementById('holdingsList');

  if (!entries.length) {
    container.innerHTML = `
      <h3>Holdings</h3>
      <div class="empty-state">No positions yet — go buy something in Market!</div>`;
    return;
  }

  const rows = entries.map(([sym, h]) => {
    const price  = liveData[sym]?.price ?? h.avgCost;
    const val    = price * h.qty;
    const gl     = (price - h.avgCost) * h.qty;
    const glPct  = ((price - h.avgCost) / h.avgCost) * 100;
    const name   = stockName(sym);

    return `
      <div class="holding-row" onclick="openModal('${sym}')">
        <div class="h-sym">${sym}</div>
        <div class="h-name">${name}</div>
        <div class="h-qty">${h.qty} sh</div>
        <div class="h-val">${fmt(val)}</div>
        <div class="h-gl ${gl >= 0 ? 'up' : 'dn'}">${fmt(gl)}<br>${fmtPct(glPct)}</div>
      </div>`;
  }).join('');

  container.innerHTML = '<h3>Holdings</h3>' + rows;
}

// ── History page ──────────────────────────────────────────────

function renderHistory() {
  document.getElementById('txCount').textContent = state.transactions.length + ' trades';
  const container = document.getElementById('txList');

  if (!state.transactions.length) {
    container.innerHTML = `
      <h3>All Transactions</h3>
      <div class="empty-state">No trades yet.</div>`;
    return;
  }

  const rows = state.transactions.map(tx => {
    const date = new Date(tx.date).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const sign = tx.type === 'buy' ? '-' : '+';
    return `
      <div class="tx-row">
        <span class="tx-type ${tx.type === 'buy' ? 'tx-buy' : 'tx-sell'}">${tx.type.toUpperCase()}</span>
        <span class="tx-sym">${tx.sym}</span>
        <span class="tx-detail">${tx.qty} shares @ ${fmt(tx.price)}</span>
        <span class="tx-amt ${tx.type === 'buy' ? 'dn' : 'up'}">${sign}${fmt(tx.total)}</span>
        <span class="tx-date">${date}</span>
      </div>`;
  }).join('');

  container.innerHTML = '<h3>All Transactions</h3>' + rows;
}

// ── Toast ─────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
