import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';

import { config } from '../config/index.js';
import { Product } from '../models/Product.js';
import { logger } from '../utils/logger.js';
import { analyzeMessageEntities } from './nlClient.js';
import { extractionResultSchema } from './schemas.js';

const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_BASE_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimitError(error) {
  const status = error?.status ?? error?.code;
  const message = String(error?.message ?? '');
  return (
    status === 429 || /\b429\b|RESOURCE_EXHAUSTED|rate limit|quota|too many requests/i.test(message)
  );
}

const EXTRACT_PROMPT = readFileSync(new URL('./prompts/extract.v1.md', import.meta.url), 'utf8');
const ACTION_PATTERNS = [
  // stock_in = barang masuk / kulakan by the owner.
  { action: 'stock_in', pattern: /\b(masuk|restock|kulak|kulakan|tambah)\b/giu },
  // sale = barang keluar / a customer buying (beli, belanja, ambil) — stock goes down.
  { action: 'sale', pattern: /\b(laku|jual|terjual|keluar|beli|belanja|ambil)\b/giu },
];

const SEGMENT_SPLIT_PATTERN = /\s*(?:,| dan | sama | terus | lalu )\s*/giu;
const KNOWN_UNITS = new Set(['pcs', 'pc', 'dus', 'box', 'karton', 'galon', 'kg', 'gram', 'gr']);
// Only match a real unit token here. A greedy `[a-zA-Z]+` would swallow the product
// word (e.g. "telur") as a "unit" and then misread the trailing price as part of the
// name ("telur 6000"). Restricting to known units keeps name + price separable.
const UNIT_ALTERNATION = [...KNOWN_UNITS].join('|');
const ITEM_PATTERN = new RegExp(
  `(?<qty>\\d+(?:[.,]\\d+)?)\\s*(?:(?<unit>${UNIT_ALTERNATION})\\s+)?(?<name>.+?)(?:\\s+(?:rp)?(?<price>\\d[\\d.]*)\\s*)?$`,
  'iu',
);
const KASBON_PATTERN =
  /^\s*kasbon\s+(?<customerRef>[^\d]+?)\s+(?<itemText>\d+(?:[.,]\d+)?\s*.*)$/iu;

let geminiClient;

function parseNumber(value) {
  if (!value) {
    return null;
  }

  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function detectAction(segment, previousAction = null) {
  for (const { action, pattern } of ACTION_PATTERNS) {
    pattern.lastIndex = 0;

    if (pattern.test(segment)) {
      return action;
    }
  }

  return previousAction;
}

function stripActionWords(segment) {
  return ACTION_PATTERNS.reduce((text, { pattern }) => text.replace(pattern, ''), segment).trim();
}

function parseItems(text) {
  const items = [];
  let currentAction = null;

  for (const rawSegment of text.split(SEGMENT_SPLIT_PATTERN)) {
    const segment = rawSegment.trim();

    if (!segment) {
      continue;
    }

    currentAction = detectAction(segment, currentAction);

    if (!currentAction) {
      continue;
    }

    const itemText = stripActionWords(segment);
    const match = itemText.match(ITEM_PATTERN);

    if (!match?.groups) {
      continue;
    }

    const possibleUnit = match.groups.unit?.toLowerCase() ?? null;
    const unit = possibleUnit && KNOWN_UNITS.has(possibleUnit) ? match.groups.unit : null;
    const rawNameSource = unit
      ? match.groups.name
      : `${match.groups.unit ?? ''} ${match.groups.name}`;
    const rawName = rawNameSource.replace(/\s+rp?\d[\d.]*$/iu, '').trim();

    if (!rawName) {
      continue;
    }

    items.push({
      rawName,
      qty: parseNumber(match.groups.qty),
      unit,
      unitPrice: parseNumber(match.groups.price),
      action: currentAction,
    });
  }

  return items;
}

function inferTransactionType(items) {
  const actions = new Set(items.map((item) => item.action));

  if (actions.size === 1) {
    return actions.values().next().value;
  }

  return null;
}

function parseKasbon(text) {
  const match = text.match(KASBON_PATTERN);

  if (!match?.groups) {
    return null;
  }

  const itemMatch = match.groups.itemText.trim().match(ITEM_PATTERN);

  if (!itemMatch?.groups) {
    return null;
  }

  const possibleUnit = itemMatch.groups.unit?.toLowerCase() ?? null;
  const unit = possibleUnit && KNOWN_UNITS.has(possibleUnit) ? itemMatch.groups.unit : null;
  const rawNameSource = unit
    ? itemMatch.groups.name
    : `${itemMatch.groups.unit ?? ''} ${itemMatch.groups.name}`;
  const rawName = rawNameSource.replace(/\s+rp?\d[\d.]*$/iu, '').trim();

  if (!rawName) {
    return null;
  }

  return {
    customerRef: match.groups.customerRef.trim(),
    items: [
      {
        rawName,
        qty: parseNumber(itemMatch.groups.qty),
        unit,
        unitPrice: parseNumber(itemMatch.groups.price),
        action: 'sale',
      },
    ],
  };
}

function normalizeExtraction(result) {
  const parsed = extractionResultSchema.parse(result);

  if (parsed.confidence < config.limits.extractionConfidenceThreshold) {
    return {
      ...parsed,
      needsClarification: true,
      clarificationQuestion:
        parsed.clarificationQuestion ??
        'Aku belum yakin. Tolong tulis ulang, contoh: "laku 2 indomie".',
    };
  }

  return parsed;
}

function localExtract(text) {
  const kasbon = parseKasbon(text);

  if (kasbon) {
    return normalizeExtraction({
      intent: 'kasbon',
      transactionType: 'sale',
      items: kasbon.items,
      customerRef: kasbon.customerRef,
      confidence: 0.82,
      needsClarification: false,
      clarificationQuestion: null,
    });
  }

  const items = parseItems(text);

  const result = {
    intent: items.length > 0 ? 'pos' : 'unknown',
    transactionType: inferTransactionType(items),
    items,
    customerRef: null,
    confidence: items.length > 0 ? 0.82 : 0.2,
    needsClarification: items.length === 0,
    clarificationQuestion:
      items.length === 0
        ? 'Transaksinya apa? Contoh: "laku 2 indomie" atau "masuk 1 dus aqua".'
        : null,
  };

  return normalizeExtraction(result);
}

function hasUsableGemini() {
  // Vertex AI mode authenticates via ADC (no API key needed). Otherwise we need a real
  // AI Studio key (placeholders fall back to the deterministic local parser).
  if (config.gcp.useVertex) {
    return true;
  }
  return (
    config.gcp.geminiApiKey && !['replace-me', 'test-gemini-key'].includes(config.gcp.geminiApiKey)
  );
}

function getGeminiClient() {
  if (!geminiClient) {
    geminiClient = config.gcp.useVertex
      ? new GoogleGenAI({
          vertexai: true,
          project: config.gcp.projectId,
          location: config.gcp.location,
        })
      : new GoogleGenAI({ apiKey: config.gcp.geminiApiKey });
  }
  return geminiClient;
}

async function getCatalogContext(shop) {
  if (!shop?._id) {
    return [];
  }

  const query = Product.find({ shopId: shop._id }).limit(50);
  const products = typeof query.lean === 'function' ? await query.lean() : await query;

  return products.map((product) => ({
    name: product.name,
    aliases: product.aliases ?? [],
    unit: product.unit ?? null,
    sellPrice: product.sellPrice ?? null,
    costPrice: product.costPrice ?? null,
  }));
}

function buildGeminiContents({ text, catalog, fallback = false }) {
  return [
    EXTRACT_PROMPT,
    fallback
      ? 'Fallback pass: use the catalog more aggressively. If still uncertain, ask exactly one clarification question.'
      : 'Primary pass.',
    `Catalog JSON:\n${JSON.stringify(catalog)}`,
    `Owner message:\n${text}`,
  ].join('\n\n');
}

const responseJsonSchema = {
  type: 'object',
  required: [
    'intent',
    'transactionType',
    'items',
    'customerRef',
    'confidence',
    'needsClarification',
    'clarificationQuestion',
  ],
  properties: {
    intent: { type: 'string', enum: ['pos', 'kasbon', 'query', 'unknown'] },
    transactionType: {
      anyOf: [{ type: 'string', enum: ['sale', 'stock_in', 'expense'] }, { type: 'null' }],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rawName', 'qty', 'unit', 'unitPrice', 'action'],
        properties: {
          rawName: { type: 'string' },
          qty: { type: 'number' },
          unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          unitPrice: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          action: { type: 'string', enum: ['sale', 'stock_in'] },
        },
      },
    },
    customerRef: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needsClarification: { type: 'boolean' },
    clarificationQuestion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

async function callGemini({ text, catalog, fallback = false }) {
  const pass = fallback ? 'fallback' : 'primary';

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model: config.gcp.geminiModel,
        contents: buildGeminiContents({ text, catalog, fallback }),
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema,
        },
      });
      const rawText = response.text;

      if (!rawText) {
        throw new Error('Gemini extraction returned empty response');
      }

      return normalizeExtraction(JSON.parse(rawText));
    } catch (error) {
      if (isRateLimitError(error) && attempt < GEMINI_MAX_RETRIES) {
        const delayMs = GEMINI_RETRY_BASE_MS * 2 ** attempt;
        logger.warn(
          { pass, attempt: attempt + 1, delayMs },
          'Gemini extraction rate-limited; retrying',
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }
}

async function extractBase({ text, shop, preferGemini }) {
  if (!preferGemini || !hasUsableGemini()) {
    return localExtract(text);
  }

  const catalog = await getCatalogContext(shop);

  try {
    const primary = await callGemini({ text, catalog });

    if (
      !primary.needsClarification &&
      primary.items.length > 0 &&
      primary.confidence >= config.limits.extractionConfidenceThreshold
    ) {
      return primary;
    }

    return await callGemini({ text, catalog, fallback: true });
  } catch (error) {
    logger.warn(
      {
        err: error,
        rateLimited: isRateLimitError(error),
        textPreview: String(text ?? '').slice(0, 60),
      },
      'Gemini extraction failed; degrading to local fallback parser',
    );
    return localExtract(text);
  }
}

// Supplement the structured extraction with GCP Natural Language API entities: fill in the
// customer name (PERSON) when the parser didn't capture one. Best-effort and flag-gated.
async function enrichWithNlEntities(result, text) {
  if (!config.gcp.nlApiEnabled || result.customerRef) {
    return result;
  }

  const { person } = await analyzeMessageEntities(text);
  return person ? { ...result, customerRef: person } : result;
}

export async function extractEntities({ text, shop, preferGemini = true }) {
  const result = await extractBase({ text, shop, preferGemini });
  return enrichWithNlEntities(result, text);
}

export const extractorInternals = {
  localExtract,
};
