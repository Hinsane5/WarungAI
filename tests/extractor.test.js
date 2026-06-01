import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractEntities } from '../src/ai/extractor.js';

const extractionFixtures = JSON.parse(
  readFileSync(new URL('./fixtures/extraction/phase3.json', import.meta.url), 'utf8'),
);

describe('extractEntities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('parses mixed stock-in and sale line items from Indonesian text', async () => {
    const result = await extractEntities({
      text: 'masuk 2 dus indomie, laku 1 galon aqua',
      preferGemini: false,
    });

    expect(result).toMatchObject({
      intent: 'pos',
      transactionType: null,
      needsClarification: false,
    });
    expect(result.items).toEqual([
      {
        rawName: 'indomie',
        qty: 2,
        unit: 'dus',
        unitPrice: null,
        action: 'stock_in',
      },
      {
        rawName: 'aqua',
        qty: 1,
        unit: 'galon',
        unitPrice: null,
        action: 'sale',
      },
    ]);
  });

  it('asks for clarification when no transaction can be extracted', async () => {
    const result = await extractEntities({ text: 'halo apa kabar', preferGemini: false });

    expect(result.intent).toBe('unknown');
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain('Transaksinya apa');
  });

  it('parses a simple kasbon command with customer reference', async () => {
    const result = await extractEntities({
      text: 'kasbon budi 2 rokok',
      preferGemini: false,
    });

    expect(result).toMatchObject({
      intent: 'kasbon',
      customerRef: 'budi',
      transactionType: 'sale',
      needsClarification: false,
    });
    expect(result.items).toEqual([
      {
        rawName: 'rokok',
        qty: 2,
        unit: null,
        unitPrice: null,
        action: 'sale',
      },
    ]);
  });

  it('passes the fixture eval set with the local fallback parser', async () => {
    for (const fixture of extractionFixtures) {
      const result = await extractEntities({ text: fixture.input, preferGemini: false });

      expect(result.intent).toBe(fixture.expectedIntent);
      expect(
        result.items.map((item) => ({
          action: item.action,
          rawName: item.rawName,
          qty: item.qty,
          unit: item.unit,
        })),
      ).toEqual(fixture.expectedItems);
    }
  });

  it('uses Gemini with catalog context when a usable API key is configured', async () => {
    vi.resetModules();
    vi.doMock('../src/config/index.js', () => ({
      config: {
        nodeEnv: 'test',
        logLevel: 'silent',
        gcp: {
          geminiApiKey: 'real-test-key',
          geminiModel: 'gemini-2.5-flash',
        },
        limits: {
          extractionConfidenceThreshold: 0.6,
        },
      },
    }));
    const generateContentMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        intent: 'pos',
        transactionType: 'sale',
        items: [
          {
            rawName: 'Aqua 1500ml',
            qty: 1,
            unit: null,
            unitPrice: 5000,
            action: 'sale',
          },
        ],
        customerRef: null,
        confidence: 0.94,
        needsClarification: false,
        clarificationQuestion: null,
      }),
    });
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: vi.fn(function GoogleGenAI() {
        this.models = {
          generateContent: generateContentMock,
        };
      }),
    }));
    vi.doMock('../src/models/Product.js', () => ({
      Product: {
        find: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: vi.fn().mockResolvedValue([
              {
                name: 'Aqua 1500ml',
                aliases: ['aqua botol gede'],
                unit: 'botol',
                sellPrice: 5000,
              },
            ]),
          })),
        })),
      },
    }));

    const { extractEntities: extractWithGemini } = await import('../src/ai/extractor.js');
    const result = await extractWithGemini({
      text: 'aqua botol gede 1',
      shop: { _id: 'shop-1' },
    });

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock.mock.calls[0][0].contents).toContain('Aqua 1500ml');
    expect(result.items[0]).toMatchObject({
      rawName: 'Aqua 1500ml',
      qty: 1,
      unitPrice: 5000,
      action: 'sale',
    });
  });
});
