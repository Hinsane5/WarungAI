// Run the regional FMCG analytics queries against BigQuery and print them.
// The B2B "FMCG Regional Data" dashboard reads these same queries.
//
// Usage:  npm run bq:report            (all regions)
//         npm run bq:report -- Tangerang
import 'dotenv/config';

import {
  getActiveWarung,
  getRetailPriceTrend,
  getTopBrands,
  getTurnoverByItem,
} from '../src/services/bigqueryService.js';

const region = process.argv[2] ?? null;
const label = region ?? 'ALL REGIONS';

const [activeWarung, topBrands, turnover, priceTrend] = await Promise.all([
  getActiveWarung({ region }),
  getTopBrands({ region, limit: 5 }),
  getTurnoverByItem({ region }),
  getRetailPriceTrend({ region }),
]);

console.log(`\n=== FMCG Regional Data — ${label} ===`);
console.log('Active warung (mitra):', activeWarung);
console.log('\nTop brands by volume:');
for (const b of topBrands) {
  console.log(`  ${b.productName}: ${b.volume} unit (Rp ${Number(b.revenue).toLocaleString('id-ID')})`);
}
console.log('\nTurnover (days per unit, lower = faster):');
for (const t of turnover.slice(0, 5)) {
  console.log(`  ${t.productName}: ${Number(t.daysPerUnit ?? 0).toFixed(2)} (${t.unitsSold} unit)`);
}
console.log('\nRetail price points (weekly avg):');
for (const p of priceTrend.slice(0, 8)) {
  const week = p.week?.value ?? p.week;
  console.log(`  ${week} ${p.productName}: Rp ${Math.round(Number(p.avgPrice)).toLocaleString('id-ID')}`);
}
console.log('');
