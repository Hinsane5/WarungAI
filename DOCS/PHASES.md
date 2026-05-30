# Build Roadmap — Phase by Phase

**Version:** 1.0 · **Last updated:** 2026-05-30

> **This is the master build plan.** Work phases in order. Each phase has: a **goal**,
> **tasks**, the **files** it touches, and a **Definition of Done (DoD)** that is the gate
> to the next phase. **Do not start a phase until the previous DoD is fully green.**
>
> For AI agents: read [`CLAUDE.md`](./CLAUDE.md) first. At the start of every session,
> identify the current phase (lowest phase whose DoD isn't met), do the smallest next task,
> verify against its acceptance criteria, then stop and report. Reference PRD story IDs
> (e.g. F1-S3) in commits.

---

## Phase progress tracker

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project foundation | ✅ done |
| 1 | WhatsApp echo loop | 🟡 in progress |
| 2 | Data layer + onboarding | 🟡 in progress |
| 3 | Conversational POS (text) + confirmation | ⬜ |
| 4 | Voice notes (STT) | ⬜ |
| 5 | Smart Kasbon + credit scoring | ⬜ |
| 6 | Frictionless loyalty capture | ⬜ |
| 7 | Proactive CRM + predictive restock (batch) | ⬜ |
| 8 | Analytics dashboard + export | ⬜ |
| 9 | Hardening, eval, demo prep | ⬜ |

> Keep this table updated as you progress (⬜ → 🟡 in progress → ✅ done).

---

## Phase 0 — Project foundation

**Goal:** A running Express server with config, DB connection, logging, and tooling — no features yet.

**Tasks**
1. `npm init`, `"type": "module"`, Node engine `>=20`. Install deps per [`TECH_STACK.md`](./TECH_STACK.md#3-suggested-dependency-set).
2. ESLint + Prettier; `npm run lint`, `npm run format`.
3. `.gitignore` (`node_modules`, `.env`, `secrets/`, `logs`, `*.log`).
4. `.env.example` (committed) + `.env` with all keys from [`TECH_STACK.md`](./TECH_STACK.md#4-environment-variables).
5. Scaffold the `src/` tree from [`CONVENTIONS.md`](./CONVENTIONS.md) (empty modules + barrel files).
6. `src/config/` — env loader validated with Zod, **fails fast** on missing required vars.
7. `src/config/db.js` — Mongoose connect with retry + clean shutdown.
8. `src/utils/logger.js` — `pino` with correlation id support.
9. `src/app.js` + `server.js`; `GET /health` → `{ status: "ok" }`.
10. Minimal test setup (Vitest/Jest + Supertest); one passing `/health` test.

**Files:** `package.json`, `.eslintrc`, `.prettierrc`, `.gitignore`, `.env.example`, `src/config/*`, `src/utils/logger.js`, `src/app.js`, `server.js`, `tests/health.test.js`

**Definition of Done**
- [ ] `npm run dev` boots without errors; `GET /health` returns `200`.
- [ ] Missing a required env var crashes startup with a clear message.
- [ ] `npm run lint` and `npm test` pass.
- [ ] MongoDB connects on boot (logged).

---

## Phase 1 — WhatsApp echo loop

**Goal:** Prove the full WhatsApp round-trip: receive a message, send a reply. (PRD plumbing for all of F1–F4.)

**Tasks**
1. `messaging/whatsapp.js` — `sendText(to, body)` via Graph API; central place for sends.
2. `routes/webhook.js` + `controllers/webhookController.js`:
   - `GET /webhook` verification handshake ([`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md#2-webhook-verification-get)).
   - `POST /webhook` → verify `X-Hub-Signature-256`, **ack 200 immediately**, async-process.
3. Capture raw body for HMAC.
4. Normalize inbound payload → internal message shape; dedupe by `message.id`.
5. Echo handler: reply `"Anda menulis: <text>"`.
6. Fixture-based webhook tests (no live WhatsApp needed).

**Files:** `messaging/whatsapp.js`, `routes/webhook.js`, `controllers/webhookController.js`, `middleware/verifySignature.js`, `tests/fixtures/webhooks/*`, `tests/webhook.test.js`

**Definition of Done**
- [ ] Meta webhook verification succeeds (GET handshake).
- [ ] Sending a WhatsApp text to the test number returns an echo within seconds.
- [ ] Invalid signature → `403`; duplicate `message.id` → ignored.
- [ ] Webhook returns `200` even when the async handler throws (error logged).

---

## Phase 2 — Data layer + onboarding

**Goal:** All Mongoose models exist; a new sender is onboarded as a Shop with a Session.

**Tasks**
1. Implement all models per [`DATA_MODEL.md`](./DATA_MODEL.md): `Shop`, `Product`, `Transaction`, `Customer`, `Kasbon`, `Session` — with the specified indexes.
2. `services/shopService.js` — `findOrCreateByOwnerPhone()`; generates `loyaltyQrSlug`.
3. `services/sessionService.js` — get/create session, set state, staleness/TTL handling.
4. Onboarding flow: first contact → create Shop + Session → welcome message explaining commands.
5. Catalog seeding strategy (lazy creation + optional guided "list top items").

**Files:** `models/*`, `services/shopService.js`, `services/sessionService.js`, `intents/router.js` (skeleton), tests.

**Definition of Done**
- [ ] First message from a new number creates a `Shop` + `Session` and sends a welcome.
- [ ] Models enforce documented indexes/uniqueness (e.g. duplicate `ownerPhone` rejected).
- [ ] Sessions persist and reload across restarts (no in-memory state).
- [ ] Unit tests for shop/session services pass.

---

## Phase 3 — Conversational POS (text) + confirmation  ⭐ core

**Goal:** F1-S1, F1-S3, F1-S4 — text → extract → confirm (Y/T) → atomic commit.

**Tasks**
1. `ai/extractor.js` — Gemini call with JSON-schema output + catalog context ([`AI_INTEGRATION.md`](./AI_INTEGRATION.md#3-entity-extraction-the-core)). Validate output with Zod.
2. `ai/prompts/extract.*` — versioned prompt + few-shot examples.
3. `intents/router.js` — classify `pos | kasbon | query | help`; consult session state first.
4. `services/posService.js`:
   - resolve `rawName` → product (exact/alias/fuzzy), learn aliases on confirm,
   - create provisional product on miss (never drop a line),
   - save `pending` transaction, drive confirmation, **atomic commit** (stock + cashDelta).
5. Confirmation state machine in router + `messaging/` (Y/T, interactive buttons, 2-failure → fast-text fallback).
6. Tier cap guard: Free shop blocked past `FREE_TIER_DAILY_TXN_CAP`.
7. Fallback ladder for low confidence / ambiguity (clarifying question).

**Files:** `ai/extractor.js`, `ai/prompts/*`, `intents/router.js`, `services/posService.js`, `services/productService.js`, `middleware/tierGate.js`, tests + extraction fixtures.

**Definition of Done** (maps to F1 acceptance criteria)
- [ ] `"masuk 2 dus indomie, laku 1 galon aqua"` → 2 correctly-typed line items.
- [ ] Confirmation message sent; `Y` commits, `T` cancels; pending rows never counted.
- [ ] Commit updates stock **and** cash atomically; no partial writes.
- [ ] Alias resolution works (`"aqua botol gede"` → catalog item) and aliases are learned.
- [ ] 2 failed confirmations → fast-text fallback offered.
- [ ] Low-confidence/ambiguous → single clarifying question (no invented values).
- [ ] Text round-trip < 10s.
- [ ] Extraction eval fixtures pass at the target accuracy bar.

---

## Phase 4 — Voice notes (STT)

**Goal:** F1-S2 — voice note → transcript → same POS pipeline.

**Tasks**
1. `messaging/media.js` — resolve `media_id` → URL → authenticated download.
2. `ai/sttClient.js` — GCP Speech-to-Text (OGG/Opus, `id-ID`, confidence).
3. Wire `type === "audio"` in the router into transcript → extractor → confirmation.
4. Persist `source:"voice"`, `sttConfidence`; surface uncertainty when low.

**Files:** `messaging/media.js`, `ai/sttClient.js`, router update, tests (mock STT).

**Definition of Done**
- [ ] A WhatsApp voice note recording a transaction is transcribed and flows through the same confirmation/commit path as text.
- [ ] Low STT confidence biases toward confirmation and is flagged.
- [ ] Media download uses auth; failures degrade gracefully (ask to resend).

---

## Phase 5 — Smart Kasbon + credit scoring

**Goal:** F2 — record debt, deterministic risk score, owner-in-the-loop reminders.

**Tasks**
1. `services/kasbonService.js` — create/update kasbon from `intent:kasbon`, link customer (by name/alias → phone later), record payments, settle.
2. Deterministic credit-score engine ([`AI_INTEGRATION.md`](./AI_INTEGRATION.md#credit-scoring)) → band, advisory warning on new credit.
3. Owner-in-the-loop: draft reminder message; owner approves before send. Customer gets debt detail on each kasbon.
4. Customer-facing debt detail message (in CS window or template).

**Files:** `services/kasbonService.js`, scoring util, router intent wiring, templates, tests.

**Definition of Done** (maps to F2)
- [ ] `"kasbon budi 2 rokok"` creates a linked debt record with correct amount.
- [ ] Poor-history customer → advisory warning (never auto-reject).
- [ ] Reminder drafts require owner approval before sending.
- [ ] Credit score recomputed on kasbon change; deterministic & unit-tested.

---

## Phase 6 — Frictionless loyalty capture

**Goal:** F3 — static QR → web app → self-register → WA stamp + comms channel.

**Tasks**
1. `web/loyalty/` lightweight page; `GET /loyalty/:slug` resolves shop.
2. `POST /api/loyalty/register` → upsert customer, link to shop (+ recent txn context), send WA stamp confirmation.
3. Generate the static QR per shop (URL = `PUBLIC_BASE_URL/loyalty/:slug`).
4. Mark registered customers opted-in (respect later opt-out).

**Files:** `web/loyalty/*`, `routes/loyalty.js`, `controllers/loyaltyController.js`, `services/loyaltyService.js`, tests.

**Definition of Done** (maps to F3)
- [ ] Scanning the QR opens a fast, low-data page that works on a low-end phone.
- [ ] Submitting a number creates/links a customer and sends a WA stamp confirmation.
- [ ] QR is static (one per shop); no per-transaction QR needed.
- [ ] Registered number becomes the channel for later CRM (verified by Phase 7).

---

## Phase 7 — Proactive CRM + predictive restock (batch)

**Goal:** F4 — nightly jobs for restock prediction, credit refresh, RFM, metered customer sends.

**Tasks**
1. `jobs/predictiveRestock.js` — avg daily sales + seasonality → stock-out flags + per-customer restock cycles ([`AI_INTEGRATION.md`](./AI_INTEGRATION.md#5-predictive-restock-deterministic-heuristic)).
2. `jobs/creditScoreRefresh.js` — nightly recompute.
3. `jobs/crmNotifier.js` — RFM segmentation; send restock reminders/promos **through quota guard** + opt-in + approved templates.
4. `jobs/index.js` + `node-cron` registration in `server.js`; jobs are pure callable functions (Cloud Scheduler-ready).
5. Owner low-stock alerts (unmetered, in-window) vs customer broadcasts (metered).

**Files:** `jobs/*`, `services/crmService.js`, quota guard in `messaging/`, templates, tests (run jobs against seeded data).

**Definition of Done** (maps to F4)
- [ ] Nightly job flags low/expiring stock to owners.
- [ ] Routine-good restock reminders sent to customers before predicted run-out.
- [ ] RFM segments computed; promo content matched to segment.
- [ ] Every customer broadcast checks Koin Bot quota + opt-in; refuses at zero and notifies owner.
- [ ] Jobs are invocable both via cron and a direct function call (HTTP-trigger ready).

---

## Phase 8 — Analytics dashboard + export

**Goal:** F5 — owner web dashboard + Premium Excel export.

> **Follow [`DASHBOARD_UI_GUIDE.md`](./DASHBOARD_UI_GUIDE.md)** for the visual spec, design tokens, component/chart styling, data contracts, and the 8a–8f build sub-phases. It is the authority on how the dashboard looks and is wired.

**Tasks**
1. MongoDB aggregation queries: stock levels, cash flow, top items, outstanding kasbon.
2. `web/dashboard/` (Bootstrap) rendering the metrics; simple auth (owner phone link/OTP or signed link).
3. Monthly Excel export, **gated to Premium tier**.

**Files:** `web/dashboard/*`, `routes/api.js` (dashboard endpoints), `services/analyticsService.js`, export util, tests.

**Definition of Done** (maps to F5)
- [ ] Dashboard shows stock, cash flow, top items, outstanding kasbon for a shop.
- [ ] Only committed transactions are counted.
- [ ] Excel export works and is blocked for Free-tier shops.

---

## Phase 9 — Hardening, eval, demo prep

**Goal:** Reliability, accuracy validation, and a clean judging demo.

**Tasks**
1. Extraction **eval harness**: labeled Indonesian fixtures → measure accuracy vs the ≥95% target; fix prompt/resolution gaps.
2. Idempotency, timeout/retry, and graceful-degradation audit across the webhook path.
3. Load-sanity: confirm webhook acks fast under burst; sessions don't leak.
4. Security pass: signature verification, secrets hygiene, PII not logged, rate/quota guards (consider `/cso`).
5. Long-lived WhatsApp token; seed a demo shop with catalog + sample data; rehearse the scripted demo (voice POS → confirm → kasbon warning → loyalty QR → restock reminder → dashboard).
6. README/docs sync with what actually shipped.

**Definition of Done**
- [ ] Extraction accuracy meets target on the eval set (recorded number).
- [ ] No path can make the webhook return non-200 on internal error.
- [ ] Security checklist green; no secrets in repo/logs.
- [ ] End-to-end demo runs reliably start to finish on the test number.

---

## Working agreements (every phase)

- Reference PRD story IDs (e.g. `F1-S3`) in commits and PRs.
- Update the **progress tracker** table above when a phase starts/finishes.
- Don't gold-plate beyond the current phase's DoD; capture extra ideas as TODOs.
- If a phase reveals a PRD/architecture gap, update the doc **before** coding around it.
- Keep money-affecting logic deterministic and tested (see [`AI_INTEGRATION.md`](./AI_INTEGRATION.md)).
