/**
 * js/movers.js  —  Top Gainers (Ups) and Top Losers (Downs) tabs.
 */

const MOVER_PERIODS = [
  { label: '1 Day',    value: '1d'  },
  { label: '5 Days',   value: '5d'  },
  { label: '1 Month',  value: '1mo' },
  { label: '3 Months', value: '3mo' },
  { label: '6 Months', value: '6mo' },
  { label: '1 Year',   value: '1y'  },
];

const MOVER_LIMITS = [10, 20, 25, 50, 100];

const moverState = {
  ups:   { period: '1d', limit: 20, loaded: false },
  downs: { period: '1d', limit: 20, loaded: false },
};

// ── Build controls ────────────────────────────────────────────

function initMoverControls(dir) {
  const container = document.getElementById(dir + 'Controls');
  if (!container) return;

  // Always rebuild so controls are never stale
  container.innerHTML = '';

  const isUp  = dir === 'ups';
  const color = isUp ? 'var(--green)' : 'var(--red)';

  // ── Header row with limit selector and refresh ──
  const topRow = document.createElement('div');
  topRow.className = 'movers-top-row';

  const limitWrap = document.createElement('div');
  limitWrap.className = 'movers-limit-wrap';
  limitWrap.innerHTML = '<span class="movers-limit-label">Show top</span>';

  const sel = document.createElement('select');
  sel.className = 'movers-limit-select';
  MOVER_LIMITS.forEach(n => {
    const opt       = document.createElement('option');
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
  limitWrap.insertAdjacentHTML('beforeend', '<span class="movers-limit-label">stocks</span>');

  const refreshBtn = document.createElement('button');
  refreshBtn.className   = 'filter-btn';
  refreshBtn.textContent = '↻ Refresh';
  refreshBtn.style.marginLeft = 'auto';
  refreshBtn.onclick = () => {
    moverState[dir].loaded = false;
    loadMovers(dir);
  };

  topRow.appendChild(limitWrap);
  topRow.appendChild(refreshBtn);

  // ── Period buttons ──
  const periodRow = document.createElement('div');
  periodRow.className = 'movers-period-row';

  const periodLabel = document.createElement('span');
  periodLabel.className   = 'movers-limit-label';
  periodLabel.textContent = 'Timeframe:';
  periodRow.appendChild(periodLabel);

  MOVER_PERIODS.forEach(p => {
    const btn         = document.createElement('button');
    btn.className     = 'mover-period-btn' + (p.value === moverState[dir].period ? ' active' : '');
    btn.textContent   = p.label;
    btn.dataset.value = p.value;
    if (isUp) btn.classList.add('mover-period-btn--up');
    else      btn.classList.add('mover-period-btn--dn');
    btn.onclick = () => {
      periodRow.querySelectorAll('.mover-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moverState[dir].period = p.value;
      moverState[dir].loaded = false;
      loadMovers(dir);
    };
    periodRow.appendChild(btn);
  });

  container.appendChild(topRow);
  container.appendChild(periodRow);
}

// ── Fetch & render ────────────────────────────────────────────

async function loadMovers(dir) {
  const { period, limit } = moverState[dir];
  const listEl = document.getElementById(dir + 'List');

  const periodLabel = MOVER_PERIODS.find(p => p.value === period)?.label ?? period;
  listEl.innerHTML = `
    <div class="movers-loading">
      <span class="loading-pulse" style="width:10px;height:10px;margin-right:10px;flex-shrink:0"></span>
      <span>Scanning ${STOCK_LIST.length.toLocaleString()} stocks over <strong>${periodLabel}</strong>…
        <div class="movers-loading-sub">First load may take 30–60s. Results are cached after that.</div>
      </span>
    </div>`;

  try {
    const direction = dir === 'ups' ? 'up' : 'down';
    const url  = `${API_BASE}/api/movers?period=${period}&limit=${limit}&direction=${direction}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    renderMovers(dir, data);
    moverState[dir].loaded = true;
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state" style="color:var(--red)">
      ⚠ Failed to load: ${err.message}<br>Make sure server.py is running.
    </div>`;
  }
}

function renderMovers(dir, movers) {
  const listEl = document.getElementById(dir + 'List');
  const isUp   = dir === 'ups';
  const period = MOVER_PERIODS.find(p => p.value === moverState[dir].period)?.label ?? moverState[dir].period;

  if (!movers.length) {
    listEl.innerHTML = '<div class="empty-state">No data returned — try a different timeframe.</div>';
    return;
  }

  const maxAbs   = Math.max(...movers.map(m => Math.abs(m.pctChange)));
  const barColor = isUp ? 'var(--green)' : 'var(--red)';

  const rows = movers.map((m, i) => {
    const sign      = m.pctChange >= 0 ? '+' : '';
    const barWidth  = maxAbs > 0 ? (Math.abs(m.pctChange) / maxAbs * 100).toFixed(1) : 0;
    const rankColor = i < 3 ? barColor : 'var(--text3)';
    return `
      <div class="mover-row" onclick="openModal('${m.sym}')">
        <div class="mover-rank" style="color:${rankColor}">${i + 1}</div>
        <div class="mover-info">
          <div class="mover-sym">${m.sym}</div>
          <div class="mover-name">${m.name}</div>
          <div class="mover-bar-wrap">
            <div class="mover-bar" style="width:${barWidth}%;background:${barColor};opacity:0.22"></div>
          </div>
        </div>
        <div class="mover-sector">${m.sector}</div>
        <div class="mover-price">${fmt(m.price)}</div>
        <div class="mover-pct ${isUp ? 'up' : 'dn'}">${sign}${m.pctChange.toFixed(2)}%</div>
        <div class="mover-abs ${isUp ? 'up' : 'dn'}">${sign}${fmt(m.absChange)}</div>
      </div>`;
  }).join('');

  listEl.innerHTML = `
    <div class="movers-header-row">
      <span>#</span><span>Stock</span><span>Sector</span>
      <span>Price</span><span>${isUp ? 'Gain' : 'Loss'} (${period})</span><span>Δ $</span>
    </div>${rows}`;
}

// ── Called from ui.js showPage ────────────────────────────────

function onMoverPageShow(dir) {
  initMoverControls(dir);
  if (!moverState[dir].loaded) {
    loadMovers(dir);
  }
}
