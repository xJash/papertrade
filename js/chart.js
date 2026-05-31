/**
 * js/chart.js
 *
 * Stock detail chart using Chart.js.
 * Manages a single chart instance (destroyed/recreated on timeframe change).
 */

let chartInstance = null;

/**
 * Load and render the price chart for a symbol and timeframe.
 * Fetches from the API (with caching) then draws via Chart.js.
 *
 * @param {string} sym        — ticker symbol
 * @param {string} range      — Yahoo range param, e.g. '1d'
 * @param {string} interval   — Yahoo interval param, e.g. '5m'
 * @param {HTMLElement} btnEl — the timeframe button that was clicked (for active state)
 */
async function loadChart(sym, range, interval, btnEl) {
  // Update active button
  if (btnEl) {
    document.querySelectorAll('#tfRow .tf-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  // Clear existing chart while loading
  const canvas = document.getElementById('mainChart');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // Check cache
  const cacheKey = `${sym}_${range}`;
  let   points   = chartDataCache[cacheKey];

  if (!points) {
    // Fetch and cache
    points = await fetchHistory(sym, range, interval);
    if (points) chartDataCache[cacheKey] = points;
  }

  if (!points || !points.length) {
    // Draw a "no data" message on canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = '#555c6e';
    ctx.font         = '12px IBM Plex Mono';
    ctx.textAlign    = 'center';
    ctx.fillText('No data available for this timeframe.', canvas.width / 2, canvas.height / 2);
    return;
  }

  const isUp  = points[points.length - 1].p >= points[0].p;
  const color = isUp ? '#00d17a' : '#ff4d6a';

  // Format x-axis labels based on timeframe
  const labels = points.map(pt => {
    const d = new Date(pt.t);
    if (['1d', '2d', '3d'].includes(range)) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const values = points.map(pt => pt.p);

  // Gradient fill
  const ctx  = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, isUp ? 'rgba(0,209,122,0.18)' : 'rgba(255,77,106,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data:            values,
        borderColor:     color,
        backgroundColor: grad,
        borderWidth:     1.5,
        pointRadius:     0,
        fill:            true,
        tension:         0.3,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode:            'index',
          intersect:       false,
          backgroundColor: '#1e2229',
          borderColor:     '#2a2e38',
          borderWidth:     1,
          titleColor:      '#8b90a0',
          bodyColor:       '#e8eaf0',
          titleFont:       { family: 'IBM Plex Mono', size: 10 },
          bodyFont:        { family: 'IBM Plex Mono', size: 12 },
          callbacks: {
            label: ctx => '$' + ctx.raw.toFixed(2),
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid:    { display: false },
          ticks:   {
            color:         '#555c6e',
            font:          { family: 'IBM Plex Mono', size: 9 },
            maxTicksLimit: 8,
            maxRotation:   0,
          },
        },
        y: {
          display:  true,
          position: 'right',
          grid:     { color: 'rgba(255,255,255,0.04)' },
          ticks:    {
            color:    '#555c6e',
            font:     { family: 'IBM Plex Mono', size: 9 },
            callback: v => '$' + v.toFixed(2),
          },
        },
      },
    },
  });
}

/**
 * Destroy the active chart instance (call when closing the modal).
 */
function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}
