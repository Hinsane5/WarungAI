# AI Integration — WarungAI

**Version:** 1.0 · **Last updated:** 2026-05-30

How WarungAI uses AI: voice transcription, entity extraction, ambiguous-message fallback,
credit scoring, predictive restock, and RFM segmentation. All AI code lives in `src/ai/`
(model calls) and the owning service. **Never** call a model from a controller.

---

## 1. AI responsibilities map

| Capability | Engine | Lives in |
|------------|--------|----------|
| Voice note → text | GCP Speech-to-Text | `ai/sttClient.js` |
| Messy text → structured line items | Gemini (Vertex AI), strict JSON | `ai/extractor.js` |
| Ambiguous / low-confidence fallback | Gemini (second pass + catalog/clarify) | `ai/extractor.js` |
| Credit scoring | **Deterministic rule engine** (no LLM) | `services/kasbonService.js` |
| Predictive restock | **Time-series heuristic** (no LLM) | `jobs/predictiveRestock.js` |
| RFM segmentation | **Deterministic rules** (no LLM) | `jobs/crmNotifier.js` |

> Money-affecting decisions (credit, restock, RFM) are **deterministic and auditable** — no
> LLM. The LLM is used only to turn messy human language into structured data, always
> gated by human confirmation (Y/T) before anything touches the books.

---

## 2. Speech-to-Text (voice notes)

WhatsApp voice notes arrive as **OGG / Opus**. Flow:

1. Receive `audio` message → get `media_id`.
2. Call Graph API to resolve the media URL, download the bytes (auth header required).
3. Send to GCP Speech-to-Text with config:
   - `encoding: OGG_OPUS`, `sampleRateHertz: 48000` (typical for WhatsApp; detect if possible)
   - `languageCode: "id-ID"`
   - enable automatic punctuation; capture `confidence`.
4. Pass the transcript + confidence into the same extractor used for text.
5. Persist `source: "voice"`, `sttConfidence` on the transaction.

If `sttConfidence` is low, still attempt extraction but bias toward asking for confirmation
and surface the uncertainty in the confirmation message.

---

## 3. Entity extraction (the core)

### 3.1 Output contract (strict JSON)

The extractor must return **only** JSON matching this schema. Validate with Zod; reject &
retry/fallback on parse failure.

```jsonc
{
  "intent": "pos" | "kasbon" | "query" | "unknown",
  "transactionType": "sale" | "stock_in" | "expense" | null,
  "items": [
    {
      "rawName": "indomie",          // as the user said it
      "qty": 2,
      "unit": "dus",                  // null if unspecified
      "unitPrice": null,              // IDR per unit, null if unspecified
      "action": "sale" | "stock_in"  // per-line action
    }
  ],
  "customerRef": "budi" | null,       // for kasbon
  "confidence": 0.0,                  // 0..1 overall
  "needsClarification": false,
  "clarificationQuestion": null
}
```

### 3.2 Prompt design (Gemini)

Keep prompts in `ai/prompts/` as versioned template files. The extraction prompt must:

- State the role: *"You convert an Indonesian warung owner's messy chat/voice transcript into structured inventory transactions."*
- Inject the **shop catalog** (canonical names + aliases + units) so the model resolves `"aqua botol gede"` → `Aqua 1500ml`. Keep it compact (top-N products or a retrieval subset for large catalogs).
- Give few-shot examples covering: multiple items in one message, sale + stock-in mixed, voice-transcription noise, local abbreviations, missing price, kasbon phrasing.
- Demand JSON-only output (use Gemini's `responseMimeType: "application/json"` + `responseSchema` when available — this is the reliable path).
- Instruct: if unsure, set `needsClarification: true` and propose one short question — **do not invent quantities or prices.**

**Example few-shot pairs (Indonesian):**

| Input | Expected (abridged) |
|-------|---------------------|
| `"masuk 2 dus indomie, laku 1 galon"` | two items: indomie `stock_in qty2 dus`, galon `sale qty1` |
| `"terjual 5kg beras"` | item beras `sale qty5 kg` |
| `"laku 3 indomie sama 2 aqua gelas"` | indomie `sale 3`, aqua gelas `sale 2` |
| `"kasbon budi 2 rokok"` | `intent: kasbon`, customerRef budi, item rokok qty2 |
| `"brp stok aqua?"` | `intent: query` |

### 3.3 Resolution after extraction (in the service, not the model)

1. For each `rawName`, match against the shop's `products` (exact → alias → fuzzy/text index). 
2. On match: attach `productId`, canonical `name`, default `sellPrice` if `unitPrice` is null.
3. On no match: create a provisional product (stock 0) **or** queue a clarification, per [`DATA_MODEL.md`](./DATA_MODEL.md#4-data-integrity-rules) rule 7 — never drop the line.
4. Learn aliases: when the owner confirms, add the `rawName` to the matched product's `aliases` (improves future accuracy → supports the ≥95% goal).

### 3.4 Fallback ladder (Risk R-01 + ambiguity)

```
1. Primary Gemini extraction (JSON schema-constrained)
2. If JSON invalid OR confidence < THRESHOLD OR no items:
     → Gemini fallback pass: richer context (more catalog, examples) + allow a clarifying question
3. If still needsClarification:
     → bot asks ONE short question; session → "clarifying"
4. If user fails confirmation 2×:
     → session → "fast_text_fallback"; offer structured template
        e.g. "Ketik: <jual/masuk> <jumlah> <barang>"
```

Set `EXTRACTION_CONFIDENCE_THRESHOLD` (config) ≈ `0.6` initially; tune against the beta set.

---

## 4. Credit scoring (deterministic) {#credit-scoring}

Per the proposal, a **rule-based** engine — no LLM. Reference formula:

```
risk = (total_outstanding × days_overdue) / max(repayment_frequency, 1)
```

Where, computed from the customer's `kasbons`:
- `total_outstanding` — sum of `amount` on `open` kasbons (IDR).
- `days_overdue` — max days past `dueDate` across open kasbons (0 if none overdue).
- `repayment_frequency` — count of settled kasbons (or payments) in the trailing window.

Map `risk` → band (tune thresholds with real data):

| Band | Meaning | Owner UX |
|------|---------|----------|
| `good` | low risk | no warning |
| `watch` | moderate | soft note when new kasbon recorded |
| `risky` | high | explicit warning + offer to draft a reminder (owner approves) |

Recompute nightly (`jobs/creditScoreRefresh`) and opportunistically when a kasbon changes.
Persist to `customer.creditScore`. **Always advisory — never auto-reject.** (Owner-in-the-loop.)

---

## 5. Predictive restock (deterministic heuristic)

Nightly per shop/product:

1. Compute `avgDailySales` from committed `sale` transactions over a trailing window (e.g. 14–30 days).
2. `daysToStockout = stock / max(avgDailySales, ε)`.
3. If `daysToStockout <= leadTimeDays` (or below `reorderPoint`) → flag low-stock to owner.
4. Apply a simple **seasonality** factor where data supports it (e.g. weekday vs weekend multiplier); keep it explainable.
5. For `isRoutine` products bought by a customer, estimate the customer's personal `avgCycleDays` and set `nextExpectedDate` → drives customer restock reminders.

Owner low-stock alerts are **not** metered. Customer reminders **are** (Koin Bot quota).

---

## 6. RFM segmentation (deterministic)

Nightly, per customer, over a trailing window:
- **Recency** = days since last committed purchase.
- **Frequency** = number of purchases.
- **Monetary** = total spend.

Score each 1–5 (quantiles within the shop), combine into a segment label
(`champion`, `loyal`, `potential`, `at_risk`, `new`, `dormant`). Segment drives promo
content selection and send priority — sends still respect quota + opt-out.

---

## 7. Cost, latency & safety guardrails

- **Model choice:** default `gemini-2.5-flash` for low latency/cost; only escalate to a larger model if accuracy on the beta set demands it.
- **Token discipline:** send a *subset* of the catalog, not the whole thing, for large shops (retrieve top/likely items).
- **Timeouts & retries:** wrap model/STT calls with a timeout and a single retry; on hard failure, ask the user to retry — never 500 the webhook (ack first, see [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md)).
- **No PII to logs:** don't log raw transcripts at `info` in production; `rawMessage` stays in the DB for auditing/retraining only.
- **Determinism for money:** reiterate — credit/restock/RFM never depend on an LLM. The LLM only proposes structured data that a human confirms.
- **Eval harness:** maintain a labeled fixture set (`tests/fixtures/extraction/*.json`) of real-ish Indonesian inputs → expected JSON; run it in CI to measure accuracy and guard regressions against the ≥95% target.
