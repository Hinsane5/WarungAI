import { LanguageServiceClient } from '@google-cloud/language';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let client;

function getClient() {
  client ??= new LanguageServiceClient();
  return client;
}

// GCP Natural Language API enrichment. The structured POS extraction (item/qty/action/price)
// is handled by Gemini/Vertex; the NL API complements it by tagging named entities — most
// usefully the PERSON (customer name) that the deterministic parser drops, plus NUMBER/PRICE
// entities we can cross-check. Always best-effort: failures never block extraction.
export async function analyzeMessageEntities(text) {
  if (!config.gcp.nlApiEnabled || !text) {
    return { person: null, numbers: [] };
  }

  try {
    const [result] = await getClient().analyzeEntities({
      document: { content: String(text), type: 'PLAIN_TEXT', language: 'id' },
      encodingType: 'UTF8',
    });

    let person = null;
    const numbers = [];
    for (const entity of result.entities ?? []) {
      if (entity.type === 'PERSON' && !person) {
        person = entity.name;
      }
      if (entity.type === 'NUMBER' || entity.type === 'PRICE') {
        const value = Number(String(entity.name).replace(/[^\d]/g, ''));
        if (Number.isFinite(value) && value > 0) {
          numbers.push(value);
        }
      }
    }

    return { person, numbers };
  } catch (error) {
    logger.warn({ err: error }, 'NL API entity analysis failed');
    return { person: null, numbers: [] };
  }
}
