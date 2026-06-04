/* global FormData, URLSearchParams, document, localStorage, window */

const params = new URLSearchParams(window.location.search);
const tokenInput = document.querySelector('#dashboardToken');
const productForm = document.querySelector('#productForm');
const productsBody = document.querySelector('#productsBody');
const formStatus = document.querySelector('#formStatus');
const productCountLabel = document.querySelector('#productCountLabel');
const dashboardNavLink = document.querySelector('#dashboardNavLink');
const chatNavLink = document.querySelector('#chatNavLink');
const customersNavLink = document.querySelector('#customersNavLink');
const roleSwitchLink = document.querySelector('#roleSwitchLink');
const dashboardToken = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';

tokenInput.value = dashboardToken;

const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);

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
  setNavHref(customersNavLink, '/dashboard/customers', token);
  setNavHref(roleSwitchLink, '/', token);
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

let productsCache = [];

function escapeAttr(value) {
  return String(value ?? '').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function viewRow(product) {
  return `<tr class="${product.lowStock ? 'low-stock' : ''}" data-row="${product.id}">
        <td><span class="product-name">${escapeAttr(product.name)}</span></td>
        <td>${escapeAttr(product.category) || '-'}</td>
        <td><span class="${product.lowStock ? 'badge badge--danger' : 'badge badge--success'}">${Number(product.stock).toLocaleString('id-ID')} ${escapeAttr(product.unit) || ''}</span></td>
        <td>${rupiah(product.sellPrice)}</td>
        <td>${rupiah(product.costPrice)}</td>
        <td>${Number(product.reorderPoint).toLocaleString('id-ID')}</td>
        <td><button type="button" class="link-button" data-edit="${product.id}">Ubah Harga</button></td>
      </tr>`;
}

function editRow(product) {
  return `<tr data-row="${product.id}">
        <td><span class="product-name">${escapeAttr(product.name)}</span></td>
        <td>${escapeAttr(product.category) || '-'}</td>
        <td>${Number(product.stock).toLocaleString('id-ID')} ${escapeAttr(product.unit) || ''}</td>
        <td><input class="price-input" type="number" min="0" step="1" value="${product.sellPrice}" data-field="sellPrice" /></td>
        <td><input class="price-input" type="number" min="0" step="1" value="${product.costPrice}" data-field="costPrice" /></td>
        <td>${Number(product.reorderPoint).toLocaleString('id-ID')}</td>
        <td class="row-actions">
          <button type="button" class="link-button" data-save="${product.id}">Simpan</button>
          <button type="button" class="link-button link-button--muted" data-cancel="${product.id}">Batal</button>
        </td>
      </tr>`;
}

function renderProducts(products) {
  productsCache = products;
  productCountLabel.textContent = `${products.length} produk`;

  if (!products.length) {
    productsBody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state">Belum ada produk</div></td></tr>';
    return;
  }

  productsBody.innerHTML = products.map(viewRow).join('');
}

function startEdit(id) {
  const product = productsCache.find((item) => item.id === id);
  const row = productsBody.querySelector(`tr[data-row="${id}"]`);
  if (product && row) {
    row.outerHTML = editRow(product);
  }
}

async function saveEdit(id) {
  const row = productsBody.querySelector(`tr[data-row="${id}"]`);
  if (!row) return;
  const body = {};
  row.querySelectorAll('input[data-field]').forEach((input) => {
    body[input.dataset.field] = Number(input.value || 0);
  });
  try {
    await api(`/api/dashboard/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setStatus('Harga diperbarui.', 'is-success');
    await loadProducts();
  } catch (error) {
    setStatus(error.message === 'product_not_found' ? 'Produk tidak ditemukan.' : 'Gagal memperbarui harga.', 'is-error');
  }
}

productsBody.addEventListener('click', (event) => {
  const { edit, save, cancel } = event.target.dataset;
  if (edit) startEdit(edit);
  else if (save) saveEdit(save);
  else if (cancel) renderProducts(productsCache);
});

async function loadProducts() {
  if (!tokenInput.value.trim()) {
    productsBody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state">Masukkan dashboard token</div></td></tr>';
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
    '<tr><td colspan="7"><div class="empty-state">Produk belum tersedia</div></td></tr>';
});
