// Resolve { unitPrice, lineTotal } (integer IDR) from a stated price + its basis.
// This is deterministic money math — the LLM only classifies the basis, never computes totals.
//
//   priceBasis 'total'    → the stated number is the total for the whole quantity
//                           ("laku 3 telur 6000" = Rp6.000 for all 3 → Rp2.000 each).
//   priceBasis 'per_unit' → the stated number is the price of ONE item
//                           ("3 telur 3000 per butir" = Rp3.000 each → Rp9.000 total).
//
// A bare trailing number defaults to 'total' (the warung shorthand; see DOCS decision).
export function resolvePricing({ qty, price, priceBasis = 'total' }) {
  if (price == null) {
    return null;
  }

  const amount = Math.round(price);
  const safeQty = qty > 0 ? qty : 1;

  if (priceBasis === 'per_unit') {
    return { unitPrice: amount, lineTotal: amount * safeQty };
  }

  return { unitPrice: Math.round(amount / safeQty), lineTotal: amount };
}
