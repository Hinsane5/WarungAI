/* global Chart, URLSearchParams, document, localStorage, window, setInterval */

const params = new URLSearchParams(window.location.search);
const tokenInput = document.querySelector('#dashboardToken');
const exportButton = document.querySelector('#exportButton');
const chatNavLink = document.querySelector('#chatNavLink');
const dashboardToken = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';
let salesChart;
let categoryChart;

tokenInput.value = dashboardToken;

function syncTokenLinks() {
  const token = tokenInput.value.trim();
  chatNavLink.href = token
    ? `/dashboard/chat?${new URLSearchParams({ token })}`
    : '/dashboard/chat';
}

syncTokenLinks();

const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);

function api(path) {
  const query = new URLSearchParams({ token: tokenInput.value.trim() });
  return fetch(`${path}?${query}`).then(async (response) => {
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json')
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      throw new Error(payload?.error || 'request_failed');
    }
    return payload;
  });
}

function badgeClass(kind) {
  if (kind === 'danger' || kind === 'risky' || kind === 'urgent') return 'badge badge--danger';
  if (kind === 'warning' || kind === 'watch') return 'badge badge--warning';
  return 'badge badge--success';
}

function setText(id, text) {
  document.querySelector(id).textContent = text;
}

function renderRows(target, rows, emptyText) {
  const el = document.querySelector(target);
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  el.innerHTML = rows.join('');
}

async function loadSummary() {
  const data = await api('/api/dashboard/summary');
  setText('#shopName', data.shop.name || 'Warung');
  setText('#tierLabel', `${data.shop.tier || 'free'} tier`);
  setText('#omzetValue', rupiah(data.omzet.value));
  setText('#omzetDelta', `↑ ${data.omzet.deltaPct}% vs ${data.omzet.vs}`);
  setText('#piutangValue', rupiah(data.piutang.value));
  setText('#piutangDelta', `⚠ ${data.piutang.overdueCount} jatuh tempo`);
  setText('#loyaltyValue', String(data.loyalty.count));
  setText('#loyaltyDelta', `↑ ${data.loyalty.newToday} baru hari ini`);
  setText('#txnValue', String(data.txnToday.count));
  setText('#txnDelta', `↑ ${data.txnToday.deltaPct}%`);
}

async function loadSalesTrend() {
  const data = await api('/api/dashboard/sales-trend');
  if (salesChart) {
    salesChart.data.labels = data.labels;
    salesChart.data.datasets[0].data = data.values;
    salesChart.update();
    return;
  }
  const ctx = document.querySelector('#salesTrend');
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(79,201,127,0.22)');
  gradient.addColorStop(1, 'rgba(79,201,127,0)');
  salesChart?.destroy();
  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          data: data.values,
          borderColor: '#4FC97F',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          backgroundColor: gradient,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#4FC97F',
          pointBorderWidth: 2,
          pointRadius: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => rupiah(context.parsed.y) } },
      },
      scales: {
        y: {
          ticks: { callback: (value) => `Rp ${Number(value).toLocaleString('id-ID')}` },
          grid: { color: '#EAE7DD' },
          beginAtZero: true,
        },
        x: { grid: { display: false } },
      },
      maintainAspectRatio: false,
    },
  });
}

async function loadCategoryAndTopItems() {
  const [categories, topItems] = await Promise.all([
    api('/api/dashboard/category-mix'),
    api('/api/dashboard/top-items'),
  ]);
  if (categoryChart) {
    categoryChart.data.labels = categories.map((item) => item.category);
    categoryChart.data.datasets[0].data = categories.map((item) => item.value);
    categoryChart.update();
  } else {
    const ctx = document.querySelector('#categoryMix');
    categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories.map((item) => item.category),
        datasets: [
          {
            data: categories.map((item) => item.value),
            backgroundColor: ['#14443A', '#2E8B68', '#4FC97F', '#E8E2D0'],
            borderColor: '#fff',
            borderWidth: 3,
          },
        ],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
          tooltip: {
            callbacks: { label: (context) => `${context.label}: ${rupiah(context.parsed)}` },
          },
        },
        maintainAspectRatio: false,
      },
    });
  }

  renderRows(
    '#topItems',
    topItems.map(
      (item) => `<div class="list-row">
        <div><p class="list-row__title">${item.name}</p><p class="list-row__meta">${item.qty} terjual</p></div>
        <span class="badge badge--success">${rupiah(item.value)}</span>
      </div>`,
    ),
    'Belum ada produk terjual',
  );
}

async function loadRestock() {
  const rows = await api('/api/dashboard/predictive-restock');
  renderRows(
    '#restockList',
    rows.map(
      (item) => `<div class="list-row">
        <div><p class="list-row__title">${item.name}</p><p class="list-row__meta">Sisa: ${item.remaining} ${item.unit} · Est. Habis: ${item.daysToStockout ?? '-'} hari</p></div>
        <span class="${badgeClass(item.urgency)}">${item.urgency === 'urgent' ? 'Urgent' : 'Perlu Restock'}</span>
      </div>`,
    ),
    'Belum ada stok yang perlu perhatian',
  );
}

async function loadCreditScores() {
  const rows = await api('/api/dashboard/credit-scores');
  renderRows(
    '#creditList',
    rows.map(
      (item) => `<div class="list-row">
        <div><p class="list-row__title">${item.name}</p><p class="list-row__meta">Debt: ${rupiah(item.debt)} · ${item.lateNote}</p></div>
        <span class="${badgeClass(item.band)}">${item.score}/100</span>
      </div>`,
    ),
    'Belum ada kasbon terbuka',
  );
}

async function loadDashboard() {
  if (!tokenInput.value.trim()) {
    document.querySelector('#shopName').textContent = 'Masukkan dashboard token';
    return;
  }
  localStorage.setItem('warungai.dashboardToken', tokenInput.value.trim());
  await Promise.all([
    loadSummary(),
    loadSalesTrend(),
    loadCategoryAndTopItems(),
    loadRestock(),
    loadCreditScores(),
  ]);
}

tokenInput.addEventListener('change', () => {
  const query = new URLSearchParams(window.location.search);
  query.set('token', tokenInput.value.trim());
  syncTokenLinks();
  window.location.search = query.toString();
});

exportButton.addEventListener('click', () => {
  const month = new Date().toISOString().slice(0, 7);
  const query = new URLSearchParams({ token: tokenInput.value.trim(), month });
  window.location.href = `/api/dashboard/export?${query}`;
});

loadDashboard().catch(() => {
  document.querySelector('#shopName').textContent = 'Dashboard belum tersedia';
});

// Auto-refresh: keep the dashboard in sync with the bot without a manual reload.
const REFRESH_MS = 12000;
let refreshing = false;

async function refreshDashboard() {
  if (refreshing || document.hidden || !tokenInput.value.trim()) {
    return;
  }
  refreshing = true;
  try {
    await loadDashboard();
  } catch {
    // ignore transient refresh errors; the next tick will retry
  } finally {
    refreshing = false;
  }
}

setInterval(refreshDashboard, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshDashboard();
  }
});
