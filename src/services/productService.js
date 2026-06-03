import { Product } from '../models/Product.js';

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function titleCase(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function productMatches(product, rawName) {
  const normalizedRawName = normalizeName(rawName);

  if (normalizeName(product.name) === normalizedRawName) {
    return true;
  }

  return (product.aliases ?? []).some((alias) => normalizeName(alias) === normalizedRawName);
}

function lowStock(product) {
  return product.reorderPoint != null && (product.stock ?? 0) <= product.reorderPoint;
}

function toDashboardProduct(product) {
  return {
    id: String(product._id),
    name: product.name,
    category: product.category ?? '',
    unit: product.unit ?? '',
    stock: product.stock ?? 0,
    sellPrice: product.sellPrice ?? 0,
    costPrice: product.costPrice ?? 0,
    reorderPoint: product.reorderPoint ?? 0,
    lowStock: lowStock(product),
  };
}

async function productsForShop(shopId) {
  const query = Product.find({ shopId });
  const sorted = typeof query.sort === 'function' ? query.sort({ name: 1 }) : query;
  return typeof sorted.lean === 'function' ? sorted.lean() : sorted;
}

export async function listDashboardProducts(shop) {
  const products = await productsForShop(shop._id);
  return products.map(toDashboardProduct);
}

export async function createDashboardProduct(shop, input) {
  const products = await Product.find({ shopId: shop._id });
  const duplicate = products.find(
    (product) => normalizeName(product.name) === normalizeName(input.name),
  );

  if (duplicate) {
    return { ok: false, reason: 'duplicate_product' };
  }

  const normalizedName = normalizeName(input.name);
  let product;
  try {
    product = await Product.create({
      shopId: shop._id,
      name: titleCase(input.name),
      aliases: [normalizedName],
      unit: input.unit,
      stock: input.stock,
      sellPrice: input.sellPrice,
      costPrice: input.costPrice,
      category: input.category,
      reorderPoint: input.reorderPoint,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { ok: false, reason: 'duplicate_product' };
    }
    throw error;
  }

  return { ok: true, id: String(product._id) };
}

export async function resolveProduct({ shopId, rawName, unit }, options = {}) {
  const products = await Product.find({ shopId }).session?.(options.session);
  const product = products.find((candidate) => productMatches(candidate, rawName));

  if (product) {
    return { product, created: false, rawName };
  }

  const createdProduct = await Product.create(
    [
      {
        shopId,
        name: titleCase(rawName),
        aliases: [normalizeName(rawName)],
        unit,
        stock: 0,
      },
    ],
    options.session ? { session: options.session } : undefined,
  );

  return { product: createdProduct[0], created: true, rawName };
}

export async function learnAlias(product, rawName) {
  const normalizedRawName = normalizeName(rawName);

  if (!normalizedRawName || productMatches(product, normalizedRawName)) {
    return product;
  }

  product.aliases = [...(product.aliases ?? []), normalizedRawName];
  await product.save();
  return product;
}
