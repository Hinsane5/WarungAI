// BigQuery warehouse for cross-shop / regional FMCG analytics (the B2B "Data Dashboard"
// from the proposal). The per-shop owner dashboard stays on MongoDB; BigQuery is the
// aggregate layer across many warung. Auth via ADC (same as Speech-to-Text).
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BigQuery } from '@google-cloud/bigquery';

import { config } from '../config/index.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { Transaction } from '../models/Transaction.js';
import { logger } from '../utils/logger.js';

// One row per transaction line item — the analytics-friendly shape.
export const TABLE_SCHEMA = [
  { name: 'txnId', type: 'STRING', mode: 'REQUIRED' },
  { name: 'itemIndex', type: 'INTEGER', mode: 'REQUIRED' },
  { name: 'shopId', type: 'STRING', mode: 'REQUIRED' },
  { name: 'region', type: 'STRING' },
  { name: 'type', type: 'STRING' },
  { name: 'productName', type: 'STRING' },
  { name: 'category', type: 'STRING' },
  { name: 'qty', type: 'NUMERIC' },
  { name: 'unitPrice', type: 'NUMERIC' },
  { name: 'lineTotal', type: 'NUMERIC' },
  { name: 'committedAt', type: 'TIMESTAMP' },
];

let client;

export function getBigQueryClient() {
  client ??= new BigQuery({ projectId: config.bigquery.projectId, location: config.bigquery.location });
  return client;
}

function tableRef() {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${config.bigquery.tableId}\``;
}

// Create the dataset + table if they don't exist. Idempotent.
export async function ensureWarehouse() {
  const bq = getBigQueryClient();
  const dataset = bq.dataset(config.bigquery.datasetId);
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await dataset.create({ location: config.bigquery.location });
    logger.info({ dataset: config.bigquery.datasetId }, 'BigQuery dataset created');
  }

  const table = dataset.table(config.bigquery.tableId);
  const [tableExists] = await table.exists();
  if (!tableExists) {
    await table.create({
      schema: TABLE_SCHEMA,
      timePartitioning: { type: 'DAY', field: 'committedAt' },
    });
    logger.info({ table: config.bigquery.tableId }, 'BigQuery table created');
  }
  return { dataset: config.bigquery.datasetId, table: config.bigquery.tableId };
}

// Flatten committed transactions into per-item rows, enriched with shop region + product category.
export async function buildExportRows({ since } = {}) {
  const match = { type: 'sale', status: 'committed' };
  if (since) {
    match.committedAt = { $gte: since };
  }

  const [transactions, shops, products] = await Promise.all([
    Transaction.find(match).lean(),
    Shop.find({}).lean(),
    Product.find({}).lean(),
  ]);

  const regionByShop = new Map(shops.map((s) => [String(s._id), s.region ?? null]));
  const categoryByProduct = new Map(products.map((p) => [String(p._id), p.category ?? null]));

  const rows = [];
  for (const txn of transactions) {
    (txn.items ?? []).forEach((item, itemIndex) => {
      rows.push({
        txnId: String(txn._id),
        itemIndex,
        shopId: String(txn.shopId),
        region: regionByShop.get(String(txn.shopId)) ?? null,
        type: txn.type,
        productName: item.name ?? null,
        category: item.productId ? (categoryByProduct.get(String(item.productId)) ?? null) : null,
        qty: item.qty ?? 0,
        unitPrice: item.unitPrice ?? 0,
        lineTotal: item.lineTotal ?? 0,
        committedAt: txn.committedAt ? new Date(txn.committedAt).toISOString() : null,
      });
    });
  }
  return rows;
}

// Export MongoDB committed sales into BigQuery via a load job. WRITE_TRUNCATE gives a clean
// dup-free snapshot (and avoids the streaming-buffer DELETE limitation). For production scale
// this would become an incremental MERGE keyed on (txnId, itemIndex).
export async function exportTransactions({ since, fullReload = true } = {}) {
  await ensureWarehouse();
  const rows = await buildExportRows({ since });
  if (rows.length === 0) {
    logger.info({ rows: 0 }, 'BigQuery export: nothing to export');
    return { exported: 0 };
  }

  const ndjson = rows.map((row) => JSON.stringify(row)).join('\n');
  const tmpFile = join(tmpdir(), `warungai-bq-${Date.now()}.ndjson`);
  await writeFile(tmpFile, ndjson);

  try {
    const table = getBigQueryClient().dataset(config.bigquery.datasetId).table(config.bigquery.tableId);
    await table.load(tmpFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: TABLE_SCHEMA },
      writeDisposition: fullReload ? 'WRITE_TRUNCATE' : 'WRITE_APPEND',
    });
  } finally {
    await unlink(tmpFile).catch(() => {});
  }

  logger.info({ rows: rows.length, fullReload }, 'BigQuery export complete');
  return { exported: rows.length };
}

async function runQuery(query, params, types) {
  const [job] = await getBigQueryClient().createQueryJob({
    query,
    params,
    types,
    location: config.bigquery.location,
  });
  const [rows] = await job.getQueryResults();
  return rows;
}

// ---- Regional analytics (the B2B dashboard data) ----

export async function getActiveWarung({ region } = {}) {
  const rows = await runQuery(
    `SELECT COUNT(DISTINCT shopId) AS activeWarung
     FROM ${tableRef()}
     WHERE (@region IS NULL OR region = @region)`,
    { region: region ?? null },
    { region: 'STRING' },
  );
  return rows[0]?.activeWarung ?? 0;
}

export async function getTopBrands({ region, limit = 5 } = {}) {
  return runQuery(
    `SELECT productName, SUM(qty) AS volume, SUM(lineTotal) AS revenue
     FROM ${tableRef()}
     WHERE (@region IS NULL OR region = @region)
     GROUP BY productName
     ORDER BY volume DESC
     LIMIT @limit`,
    { region: region ?? null, limit },
    { region: 'STRING', limit: 'INT64' },
  );
}

export async function getTurnoverByItem({ region } = {}) {
  return runQuery(
    `SELECT productName,
            SUM(qty) AS unitsSold,
            COUNT(DISTINCT DATE(committedAt)) AS activeDays,
            SAFE_DIVIDE(COUNT(DISTINCT DATE(committedAt)), SUM(qty)) AS daysPerUnit
     FROM ${tableRef()}
     WHERE (@region IS NULL OR region = @region)
     GROUP BY productName
     ORDER BY unitsSold DESC
     LIMIT 10`,
    { region: region ?? null },
    { region: 'STRING' },
  );
}

export async function getRetailPriceTrend({ region, productName } = {}) {
  return runQuery(
    `SELECT DATE_TRUNC(DATE(committedAt), WEEK) AS week,
            productName,
            AVG(unitPrice) AS avgPrice
     FROM ${tableRef()}
     WHERE (@region IS NULL OR region = @region)
       AND (@productName IS NULL OR productName = @productName)
     GROUP BY week, productName
     ORDER BY week`,
    { region: region ?? null, productName: productName ?? null },
    { region: 'STRING', productName: 'STRING' },
  );
}
