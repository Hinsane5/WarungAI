/* global Chart, URLSearchParams, document, localStorage, window */

const params = new URLSearchParams(window.location.search);
const tokenInput = document.querySelector('#dashboardToken');
const regionSelect = document.querySelector('#regionSelect');
const dashboardNavLink = document.querySelector('#dashboardNavLink');
const chatNavLink = document.querySelector('#chatNavLink');
const topBrandEmpty = document.querySelector('#topBrandEmpty');
const dashboardToken = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';
let topBrandChart;
let priceTrendChart;

tokenInput.value = dashboardToken;
regionSelect.value = params.get('region') || 'Tangerang';

const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);

function syncLinks() {
  const token = tokenInput.value.trim();
  dashboardNavLink.href = token ? `/dashboard?${new URLSearchParams({ token })}` : '/dashboard';
  chatNavLink.href = token
    ? `/dashboard/chat?${new URLSearchParams({ token })}`
    : '/dashboard/chat';
}

function api(path, extra = {}) {
  const query = new URLSearchParams({
    token: tokenInput.value.trim(),
    region: regionSelect.value,
    ...extra,
  });
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

function chartColors(count) {
  const palette = ['#2563EB', '#14443A', '#2E8B68', '#4FC97F', '#D97706', '#7FD9A0'];
  return Array.from({ length: count }, (_value, index) => palette[index % palette.length]);
}

function renderTopBrandChart(rows) {
  const ctx = document.querySelector('#topBrandChart');
  topBrandEmpty.classList.toggle('d-none', rows.length > 0);

  if (topBrandChart) {
    topBrandChart.destroy();
  }

  if (!rows.length) {
    return;
  }

  topBrandChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: rows.map((row) => row.productName),
      datasets: [
        {
          data: rows.map((row) => row.volume),
          backgroundColor: chartColors(rows.length),
          borderColor: '#fff',
          borderWidth: 3,
        },
      ],
    },
    options: {
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (context) => {
              const row = rows[context.dataIndex];
              return `${row.productName}: ${row.volume.toLocaleString('id-ID')} unit · ${rupiah(row.revenue)}`;
            },
          },
        },
      },
      maintainAspectRatio: false,
    },
  });
}

function renderPriceTrend(rows) {
  const ctx = document.querySelector('#priceTrendChart');
  const weeks = [...new Set(rows.map((row) => row.week))];
  const products = [...new Set(rows.map((row) => row.productName))].slice(0, 4);

  if (priceTrendChart) {
    priceTrendChart.destroy();
  }

  priceTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: weeks,
      datasets: products.map((productName, index) => ({
        label: productName,
        data: weeks.map(
          (week) =>
            rows.find((row) => row.week === week && row.productName === productName)?.avgPrice ??
            null,
        ),
        borderColor: chartColors(products.length)[index],
        backgroundColor: 'transparent',
        borderWidth: 3,
        tension: 0.35,
        spanGaps: true,
      })),
    },
    options: {
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${rupiah(context.parsed.y)}`,
          },
        },
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

  setText(
    '#trendCaption',
    rows.length ? `${products.length} produk · ${weeks.length} minggu` : 'Belum ada data harga',
  );
}

async function loadB2b() {
  if (!tokenInput.value.trim()) {
    setText('#activeWarungValue', 'Token');
    setText('#turnoverAvgValue', '-');
    setText('#regionBadge', 'Masukkan dashboard token');
    return;
  }

  localStorage.setItem('warungai.dashboardToken', tokenInput.value.trim());
  syncLinks();

  const [summary, topBrands, turnover, priceTrend] = await Promise.all([
    api('/api/dashboard/b2b/summary'),
    api('/api/dashboard/b2b/top-brands', { limit: '6' }),
    api('/api/dashboard/b2b/turnover'),
    api('/api/dashboard/b2b/price-trend'),
  ]);

  setText('#activeWarungValue', Number(summary.activeWarung ?? 0).toLocaleString('id-ID'));
  setText(
    '#turnoverAvgValue',
    `${Number(summary.avgTurnoverDays ?? 0).toLocaleString('id-ID')} hari`,
  );
  setText('#regionBadge', summary.region || regionSelect.value);
  renderTopBrandChart(topBrands);
  renderPriceTrend(priceTrend);
  renderRows(
    '#turnoverList',
    turnover.map(
      (item) => `<div class="list-row">
        <div><p class="list-row__title">${item.productName}</p><p class="list-row__meta">${Number(item.unitsSold ?? 0).toLocaleString('id-ID')} unit · ${Number(item.activeDays ?? 0).toLocaleString('id-ID')} hari aktif</p></div>
        <span class="badge badge--info">${Number(item.daysPerUnit ?? 0).toLocaleString('id-ID')} hari/unit</span>
      </div>`,
    ),
    'Belum ada data turnover.',
  );
}

function updateLocation() {
  const query = new URLSearchParams({
    token: tokenInput.value.trim(),
    region: regionSelect.value,
  });
  window.location.search = query.toString();
}

tokenInput.addEventListener('change', updateLocation);
regionSelect.addEventListener('change', updateLocation);

syncLinks();
loadB2b().catch(() => {
  setText('#activeWarungValue', 'Error');
  setText('#turnoverAvgValue', '-');
  setText('#regionBadge', 'Data belum tersedia');
  renderRows('#turnoverList', [], 'B2B data belum tersedia.');
  renderTopBrandChart([]);
  renderPriceTrend([]);
});
