/* global FormData, URLSearchParams, document, localStorage, window */

const params = new URLSearchParams(window.location.search);
const tokenInput = document.querySelector('#dashboardToken');
const productForm = document.querySelector('#productForm');
const productsBody = document.querySelector('#productsBody');
const formStatus = document.querySelector('#formStatus');
const productCountLabel = document.querySelector('#productCountLabel');
const dashboardNavLink = document.querySelector('#dashboardNavLink');
const chatNavLink = document.querySelector('#chatNavLink');
const b2bNavLink = document.querySelector('#b2bNavLink');
const dashboardToken = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';

tokenInput.value = dashboardToken;

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
  b2bNavLink.href = token ? `/dashboard/b2b?${new URLSearchParams({ token })}` : '/dashboard/b2b';
}

function query() {
  return new URLSearchParams({ token: tokenInput.value.trim() });
}

async function api(path, options) {
  const response = await fetch(`${path}?${query()}`, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'request_failed');
  }
  return payload;
}

function setStatus(text, state = '') {
  formStatus.textContent = text;
  formStatus.className = `form-status ${state}`.trim();
}

function renderProducts(products) {
  productCountLabel.textContent = `${products.length} produk`;

  if (!products.length) {
    productsBody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Belum ada produk</div></td></tr>';
    return;
  }

  productsBody.innerHTML = products
    .map(
      (product) => `<tr class="${product.lowStock ? 'low-stock' : ''}">
        <td><span class="product-name">${product.name}</span></td>
        <td>${product.category || '-'}</td>
        <td><span class="${product.lowStock ? 'badge badge--danger' : 'badge badge--success'}">${Number(product.stock).toLocaleString('id-ID')} ${product.unit || ''}</span></td>
        <td>${rupiah(product.sellPrice)}</td>
        <td>${rupiah(product.costPrice)}</td>
        <td>${Number(product.reorderPoint).toLocaleString('id-ID')}</td>
      </tr>`,
    )
    .join('');
}

async function loadProducts() {
  if (!tokenInput.value.trim()) {
    productsBody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Masukkan dashboard token</div></td></tr>';
    return;
  }

  localStorage.setItem('warungai.dashboardToken', tokenInput.value.trim());
  syncLinks();
  renderProducts(await api('/api/dashboard/products'));
}

function formPayload() {
  const data = new FormData(productForm);
  return {
    name: String(data.get('name') ?? '').trim(),
    category: String(data.get('category') ?? '').trim(),
    unit: String(data.get('unit') ?? '').trim() || 'pcs',
    stock: Number(data.get('stock') ?? 0),
    sellPrice: Number(data.get('sellPrice') ?? 0),
    costPrice: Number(data.get('costPrice') ?? 0),
    reorderPoint: Number(data.get('reorderPoint') ?? 0),
  };
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Menyimpan...');
  try {
    await api('/api/dashboard/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formPayload()),
    });
    productForm.reset();
    productForm.stock.value = '0';
    productForm.sellPrice.value = '0';
    productForm.costPrice.value = '0';
    productForm.reorderPoint.value = '0';
    setStatus('Produk tersimpan.', 'is-success');
    await loadProducts();
  } catch (error) {
    setStatus(
      error.message === 'duplicate_product'
        ? 'Produk dengan nama itu sudah ada.'
        : 'Produk belum bisa disimpan.',
      'is-error',
    );
  }
});

tokenInput.addEventListener('change', () => {
  const token = tokenInput.value.trim();
  window.location.search = token ? new URLSearchParams({ token }).toString() : '';
});

syncLinks();
loadProducts().catch(() => {
  productsBody.innerHTML =
    '<tr><td colspan="6"><div class="empty-state">Produk belum tersedia</div></td></tr>';
});
