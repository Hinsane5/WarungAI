/* global URLSearchParams, document, localStorage, window */

const params = new URLSearchParams(window.location.search);
const tokenInput = document.querySelector('#dashboardToken');
const segmentFilter = document.querySelector('#segmentFilter');
const customersBody = document.querySelector('#customersBody');
const customerCountLabel = document.querySelector('#customerCountLabel');
const dashboardNavLink = document.querySelector('#dashboardNavLink');
const chatNavLink = document.querySelector('#chatNavLink');
const productsNavLink = document.querySelector('#productsNavLink');
const roleSwitchLink = document.querySelector('#roleSwitchLink');
const dashboardToken = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';
let customers = [];

tokenInput.value = dashboardToken;
segmentFilter.value = params.get('segment') || 'all';

const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setNavHref(link, path, token) {
  if (!link) {
    return;
  }
  link.href = token ? `${path}?${new URLSearchParams({ token })}` : path;
}

function syncLinks() {
  const token = tokenInput.value.trim();
  if (token) {
    localStorage.setItem('warungai.dashboardToken', token);
  }
  setNavHref(dashboardNavLink, '/dashboard', token);
  setNavHref(chatNavLink, '/dashboard/chat', token);
  setNavHref(productsNavLink, '/dashboard/products', token);
  setNavHref(roleSwitchLink, '/', token);
}

function badgeClass(kind) {
  if (kind === 'risky' || kind === 'at_risk') return 'badge badge--danger';
  if (kind === 'watch' || kind === 'dormant') return 'badge badge--warning';
  if (kind === 'unsegmented') return 'badge';
  return 'badge badge--success';
}

function segmentLabel(segment) {
  return String(segment || 'unsegmented').replaceAll('_', ' ');
}

function query() {
  return new URLSearchParams({ token: tokenInput.value.trim() });
}

async function api(path) {
  const response = await fetch(`${path}?${query()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'request_failed');
  }
  return payload;
}

function renderCustomers() {
  const selectedSegment = segmentFilter.value;
  const visibleCustomers = customers
    .filter((customer) => selectedSegment === 'all' || customer.segment === selectedSegment)
    .sort(
      (a, b) =>
        b.outstandingKasbon - a.outstandingKasbon ||
        String(a.segment).localeCompare(String(b.segment)) ||
        String(a.name).localeCompare(String(b.name)),
    );

  customerCountLabel.textContent = `${visibleCustomers.length} pelanggan`;

  if (!visibleCustomers.length) {
    customersBody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Tidak ada pelanggan untuk filter ini</div></td></tr>';
    return;
  }

  customersBody.innerHTML = visibleCustomers
    .map(
      (customer) => `<tr>
        <td>
          <div class="customer-name">${escapeHtml(customer.name)}</div>
        </td>
        <td><span class="customer-phone">${escapeHtml(customer.phone || '-')}</span></td>
        <td>
          <div class="loyalty-stack">
            <span>${Number(customer.stamps).toLocaleString('id-ID')} stamp</span>
            <span class="metric-note">${Number(customer.points).toLocaleString('id-ID')} poin</span>
          </div>
        </td>
        <td><span class="${badgeClass(customer.segment)} segment-cell">${escapeHtml(segmentLabel(customer.segment))}</span></td>
        <td>${rupiah(customer.outstandingKasbon)}</td>
        <td>
          <div class="credit-stack">
            <span class="${badgeClass(customer.creditBand)}">${escapeHtml(customer.creditBand)}</span>
            <span class="metric-note">${Number(customer.creditScore).toLocaleString('id-ID')} / 100</span>
          </div>
        </td>
      </tr>`,
    )
    .join('');
}

async function loadCustomers() {
  syncLinks();

  if (!tokenInput.value.trim()) {
    customers = [];
    customerCountLabel.textContent = '0 pelanggan';
    customersBody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Masukkan dashboard token</div></td></tr>';
    return;
  }

  localStorage.setItem('warungai.dashboardToken', tokenInput.value.trim());
  customersBody.innerHTML =
    '<tr><td colspan="6"><div class="empty-state">Memuat pelanggan...</div></td></tr>';

  try {
    customers = await api('/api/dashboard/customers');
    renderCustomers();
  } catch (error) {
    customers = [];
    customerCountLabel.textContent = '0 pelanggan';
    customersBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Gagal memuat: ${escapeHtml(error.message)}</div></td></tr>`;
  }
}

tokenInput.addEventListener('change', loadCustomers);
segmentFilter.addEventListener('change', renderCustomers);

syncLinks();
loadCustomers();
