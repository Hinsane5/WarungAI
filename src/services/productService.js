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
