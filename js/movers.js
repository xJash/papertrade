/**
 * js/movers.js
 *
 * Top Gainers (Ups) and Top Losers (Downs) tabs.
 *
 * The server does the heavy lifting — it downloads history for all ~3,000
 * stocks, computes % change, sorts, and returns the top N.
 * Results are cached server-side for 5 minutes so repeat requests are instant.
 *
 * Note: the first load for a new period takes 20–60s depending on your
 * connection, since the server is pulling data for thousands of tickers.
 * Subsequent loads within the cache window are near-instant.
 */

// ── Config ────────────────────────────────────────────────────────────────────

const MOVER_PERIODS = [
  { label: '1 Day',    value: '1d'  },
  { label: '5 Days',   value: '5d'  },
  { label: '1 Month',  value: '1mo' },
  { label: '3 Months', value: '3mo' },
  { label: '6 Months', value: '6mo' },
  { label: '1 Year',   value: '1y'  },
];

const MOVER_LIMITS = [10, 20, 25, 50, 100];

// Track selected state for each tab independently
const moverState = {
  ups:   { period: '1d', limit: 20, loaded: false },
  downs: { period: '1d', limit: 20, loaded: false },
};


// ── Initialise controls ───────────────────────────────────────────────────────

/**
 * Build the period + limit controls for a tab and inject them into the DOM.
 * Called once per tab on first visit.
 *
 * @param {'ups'|'downs'} dir
 */
function initMoverControls(dir) {
  const container = document.getElementById(`${dir}Controls`);
  if (!container || container.children.length > 0) return;  // already built

  const color = dir === 'ups' ? 'var(--green)' : 'var(--red)';

  // ── Period buttons ──
  const periodRow = document.createElement('div');
  periodRow.className = 'movers-period-row';

  MOVER_PERIODS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className   = 'tf-btn' + (p.value === moverState[dir].period ? ' active' : '');
    btn.textContent = p.label;
    btn.style.setProperty('--active-color', color);
    btn.onclick = () => {
      periodRow.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moverState[dir].period = p.value;
      moverState[dir].loaded = false;
      loadMovers(dir);
    };
    periodRow.appendChild(btn);
  });

  // ── Limit selector ──
  const limitWrap = document.createElement('div');
  limitWrap.className = 'movers-limit-wrap';
  limitWrap.innerHTML = `<span class="movers-limit-label">Show top</span>`;

  const sel = document.createElement('select');
  sel.className = 'movers-limit-select';
  MOVER_LIMITS.forEach(n => {
    const opt = document.createElement('option');
    opt.value       = n;
    opt.textContent = n;
    opt.selected    = n === moverState[dir].limit;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    moverState[dir].limit  = parseInt(sel.value);
    moverState[dir].loaded = false;
    loadMovers(dir);
  };

  limitWrap.appendChild(sel);
  limitWrap.insertAdjacentHTML('beforeend', `<span class="movers-limit-label">stocks</span>`);

  // ── Refresh button ──
  const refreshBtn = document.createElement('button');
  refreshBtn.className   = 'filter-btn movers-refresh';
  refreshBtn.textContent = '↻ Refresh';
  refreshBtn.onclick     = () => {
    moverState[dir].loaded = false;
    loadMovers(dir);
  };

  container.appendChild(periodRow);
  container.appendChild(limitWrap);
  container.appendChild(refreshBtn);
}


// ── Load & render ─────────────────────────────────────────────────────────────

/**
 * Fetch mover data from the server and render the results list.
 * Shows a loading spinner while the server crunches.
 *
 * @param {'ups'|'downs'} dir
 */
async function loadMovers(dir) {
  const { period, limit } = moverState[dir];
  const listEl = document.getElementById(`${dir}List`);

  listEl.innerHTML = `
    <div class="movers-loading">
      <span class="loading-pulse" style="width:10px;height:10px;margin-right:8px"></span>
      Scanning ${STOCK_LIST.length.toLocaleString()} stocks over
      ${MOVER_PERIODS.find(p => p.value === period)?.label ?? period}…
      <div class="movers-loading-sub">
        This may take up to a minute on first load.<br>
        Results are cached — subsequent loads are instant.
      </div>
    </div>`;

  try {
    const url  = `${API_BASE}/api/movers?period=${period}&limit=${limit}&direction=${dir === 'ups' ? 'up' : 'down'}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    renderMovers(dir, data);
    moverState[dir].loaded = true;
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state" style="color:var(--red)">
      ⚠ Failed to load: ${err.message}<br>
      Make sure server.py is running.
    </div>`;
  }
}

/**
 * Render the ranked list of movers into the DOM.
 *
 * @param {'ups'|'downs'} dir
 * @param {Array} movers   — array of { sym, name, sector, price, pctChange, absChange }
 */
function renderMovers(dir, movers) {
  const listEl = document.getElementById(`${dir}List`);
  const isUp   = dir === 'ups';
  const period = MOVER_PERIODS.find(p => p.value === moverState[dir].period)?.label ?? moverState[dir].period;

  if (!movers.length) {
    listEl.innerHTML = '<div class="empty-state">No data returned — try a different timeframe.</div>';
    return;
  }

  const maxAbs = Math.max(...movers.map(m => Math.abs(m.pctChange)));

  const rows = movers.map((m, i) => {
    const sign      = m.pctChange >= 0 ? '+' : '';
    const barWidth  = maxAbs > 0 ? Math.abs(m.pctChange) / maxAbs * 100 : 0;
    const barColor  = isUp ? 'var(--green)' : 'var(--red)';
    const rankColor = i < 3 ? (isUp ? 'var(--green)' : 'var(--red)') : 'var(--text3)';

    return `
      <div class="mover-row" onclick="openModal('${m.sym}')">
        <div class="mover-rank" style="color:${rankColor}">${i + 1}</div>
        <div class="mover-info">
          <div class="mover-sym">${m.sym}</div>
          <div class="mover-name">${m.name}</div>
          <div class="mover-bar-wrap">
            <div class="mover-bar" style="width:${barWidth.toFixed(1)}%;background:${barColor};opacity:0.25"></div>
          </div>
        </div>
        <div class="mover-sector">${m.sector}</div>
        <div class="mover-price">${fmt(m.price)}</div>
        <div class="mover-pct ${isUp ? 'up' : 'dn'}">
          ${sign}${m.pctChange.toFixed(2)}%
        </div>
        <div class="mover-abs ${isUp ? 'up' : 'dn'}" style="font-size:11px">
          ${sign}${fmt(m.absChange)}
        </div>
      </div>`;
  }).join('');

  listEl.innerHTML = `
    <div class="movers-header-row">
      <span>#</span>
      <span>Stock</span>
      <span>Sector</span>
      <span>Price</span>
      <span>${isUp ? 'Gain' : 'Loss'} (${period})</span>
      <span>Δ $</span>
    </div>
    ${rows}`;
}


// ── Hook into page navigation ─────────────────────────────────────────────────

/**
 * Called by showPage() in ui.js when the user switches to ups/downs.
 * Builds controls on first visit and auto-loads if not yet loaded.
 *
 * @param {'ups'|'downs'} dir
 */
function onMoverPageShow(dir) {
  initMoverControls(dir);
  if (!moverState[dir].loaded) {
    loadMovers(dir);
  }
}
