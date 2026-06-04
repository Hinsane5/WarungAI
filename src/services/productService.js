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

function nameTokens(value) {
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean);
}

function productMatches(product, rawName) {
  const normalizedRawName = normalizeName(rawName);

  if (normalizeName(product.name) === normalizedRawName) {
    return true;
  }

  return (product.aliases ?? []).some((alias) => normalizeName(alias) === normalizedRawName);
}

// Partial-name match: every word the owner typed must appear as a whole word in the
// product's name or one of its aliases ("gula" -> "Gula 1kg", "indomie" -> "Indomie
// Goreng"). Ranked by fewest extra words, then shortest name, so the closest, most
// stable candidate wins. Returns null when nothing is a clear superset of the input.
function fuzzyMatchProduct(products, rawName) {
  const rawTokens = nameTokens(rawName);

  if (rawTokens.length === 0) {
    return null;
  }

  let best = null;
  for (const product of products) {
    const candidates = [product.name, ...(product.aliases ?? [])];
    let extra = Infinity;

    for (const candidate of candidates) {
      const candidateTokens = nameTokens(candidate);

      if (candidateTokens.length === 0) {
        continue;
      }

      if (rawTokens.every((token) => candidateTokens.includes(token))) {
        extra = Math.min(extra, candidateTokens.length - rawTokens.length);
      }
    }

    if (extra === Infinity) {
      continue;
    }

    const nameLength = normalizeName(product.name).length;
    if (!best || extra < best.extra || (extra === best.extra && nameLength < best.nameLength)) {
      best = { product, extra, nameLength };
    }
  }

  return best?.product ?? null;
}

function findExistingProduct(products, rawName) {
  return (
    products.find((candidate) => productMatches(candidate, rawName)) ??
    fuzzyMatchProduct(products, rawName)
  );
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

async function applyProductDefaults(product, { sellPrice, costPrice, unit }, options = {}) {
  let changed = false;

  if (sellPrice != null && product.sellPrice == null) {
    product.sellPrice = sellPrice;
    changed = true;
  }
  if (costPrice != null && product.costPrice == null) {
    product.costPrice = costPrice;
    changed = true;
  }
  if (unit && !product.unit) {
    product.unit = unit;
    changed = true;
  }

  if (changed && typeof product.save === 'function') {
    await product.save(options.session ? { session: options.session } : undefined);
  }

  return product;
}

async function productsForShop(shopId) {
  const query = Product.find({ shopId });
  const sorted = typeof query.sort === 'function' ? query.sort({ name: 1 }) : query;
  return typeof sorted.lean === 'function' ? sorted.lean() : sorted;
}

async function productsForResolution(shopId, session) {
  const query = Product.find({ shopId });
  const scopedQuery = session && typeof query.session === 'function' ? query.session(session) : query;
  return scopedQuery;
}

export async function listDashboardProducts(shop) {
  const products = await productsForShop(shop._id);
  return products.map(toDashboardProduct);
}

export async function findProductByName({ shopId, rawName }, options = {}) {
  const products = await productsForResolution(shopId, options.session);
  return findExistingProduct(products, rawName);
}

export async function updateProductPrice({ shopId, productId, rawName, priceType, price }) {
  const product = productId
    ? await Product.findOne({ _id: productId, shopId })
    : await findProductByName({ shopId, rawName });

  if (!product) {
    return null;
  }

  product[priceType] = price;
  await product.save();
  return product;
}

// Dashboard inline edit: set sell and/or cost price on an owned product. Returns the
// dashboard-shaped product, or null if the id is invalid or not in this shop.
export async function updateDashboardProductPrices(shop, productId, { sellPrice, costPrice }) {
  let product;
  try {
    product = await Product.findOne({ _id: productId, shopId: shop._id });
  } catch {
    return null;
  }

  if (!product) {
    return null;
  }

  if (sellPrice != null) {
    product.sellPrice = sellPrice;
  }
  if (costPrice != null) {
    product.costPrice = costPrice;
  }
  await product.save();
  return toDashboardProduct(product);
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
  const products = await productsForResolution(shopId, options.session);
  const product = findExistingProduct(products, rawName);

  if (product) {
    return { product, created: false, rawName };
  }

  if (options.createIfMissing === false) {
    return { product: null, created: false, rawName };
  }

  let createdProduct;
  try {
    createdProduct = await Product.create(
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
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const refreshedProducts = await productsForResolution(shopId, options.session);
    const refreshedProduct = findExistingProduct(refreshedProducts, rawName);

    if (!refreshedProduct) {
      throw error;
    }

    return { product: refreshedProduct, created: false, rawName };
  }

  return { product: createdProduct[0], created: true, rawName };
}

export async function createPricedProduct({ shopId, rawName, unit, sellPrice, costPrice }, options = {}) {
  const products = await productsForResolution(shopId, options.session);
  const existingProduct = findExistingProduct(products, rawName);

  if (existingProduct) {
    return applyProductDefaults(existingProduct, { sellPrice, costPrice, unit }, options);
  }

  let product;
  try {
    [product] = await Product.create(
      [
        {
          shopId,
          name: titleCase(rawName),
          aliases: [normalizeName(rawName)],
          unit,
          stock: 0,
          sellPrice,
          costPrice,
        },
      ],
      options.session ? { session: options.session } : undefined,
    );
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const refreshedProducts = await productsForResolution(shopId, options.session);
    product = findExistingProduct(refreshedProducts, rawName);

    if (!product) {
      throw error;
    }

    await applyProductDefaults(product, { sellPrice, costPrice, unit }, options);
  }

  return product;
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
