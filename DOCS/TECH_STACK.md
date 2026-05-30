# Tech Stack — WarungAI

**Version:** 1.0 · **Last updated:** 2026-05-30

This document records every technology choice, *why* it was chosen, the version target,
and the proposal-vs-MVP mapping. When an agent adds a dependency, it must be justified
against the principles here.

---

## 1. Selection principles

1. **Match the team's strengths** — proposal commits to Node.js + MongoDB + GCP.
2. **Free/cheap for MVP** — this is a competition build; prefer free tiers and avoid anything requiring lengthy commercial approval.
3. **Fewest moving parts that satisfy the PRD** — don't add a queue, cache, or microservice until a phase requires it.
4. **Production-aware seams** — pick MVP tools whose production replacement (per the proposal) drops in cleanly.

---

## 2. Stack summary

| Layer | MVP choice | Proposal / production | Why |
|-------|-----------|------------------------|-----|
| Runtime | **Node.js 20 LTS** | same | Proposal-specified; great async I/O for webhook workloads |
| Web framework | **Express 4** | same | Lightweight, MVC-friendly, ubiquitous |
| Messaging | **WhatsApp Cloud API (Meta, direct)** | Official **BSP** | Cloud API has a free test tier and needs no BSP contract → ideal for MVP; swap to BSP at scale via the `messaging/` adapter |
| Voice → text | **GCP Speech-to-Text** | same | Handles WhatsApp OGG/Opus; proposal-specified |
| Entity extraction | **Google Gemini via Vertex AI** | Vertex AI (+ optional NL API) | A single generative model reliably extracts `{action,item,qty,price}` from messy Indonesian + handles the ambiguous-fallback case — simpler and more accurate than the legacy Natural Language API for this task (see §5) |
| Database | **MongoDB** (Atlas free tier or local) + **Mongoose** | MongoDB | Proposal-specified; flexible schema fits dynamic inventory & behavioral history |
| Scheduling | **`node-cron`** | **Cloud Scheduler** | In-process cron is enough for MVP nightly batch; production moves to Cloud Scheduler hitting an HTTP trigger |
| Analytics | **MongoDB aggregation pipeline** | **BigQuery + Looker Studio** | Aggregation covers the single-shop dashboard; BigQuery for cross-shop regional scale (post-MVP) |
| Web UI | **HTML / CSS / JS / Bootstrap 5** | same | Proposal-specified; lightweight loyalty page + dashboard, low data usage |
| Validation | **Zod** (or `joi`) | same | Validate AI output JSON + API inputs at trust boundaries |
| HTTP client | **`undici` / native `fetch`** | same | Node 20 has global `fetch`; no axios needed |
| Logging | **`pino`** | same | Fast structured JSON logs with correlation ids |
| Testing | **Vitest** or **Jest** + **Supertest** | same | Unit + webhook integration tests |
| Lint/format | **ESLint + Prettier** | same | Consistency for multi-agent edits |
| Tunnel (dev) | **ngrok** | n/a | Expose local webhook to Meta during development |

---

## 3. Suggested dependency set

> Pin exact versions in `package.json` when scaffolding (Phase 0). This is the intended set, not a lockfile.

**Runtime**
- `express`, `mongoose`, `dotenv`, `pino`, `pino-http`, `zod`, `node-cron`
- `@google-cloud/speech` (Speech-to-Text)
- `@google/genai` (Gemini / Vertex AI SDK) — or `@google-cloud/vertexai`

**Dev**
- `vitest` (or `jest`) + `supertest`, `eslint`, `prettier`, `nodemon`

**Note on WhatsApp:** the Cloud API is plain HTTPS (Graph API). No SDK is required — wrap
`fetch` in `messaging/whatsapp.js`. (If a richer DX is wanted, `whatsapp-web.js` exists but
it drives a personal WhatsApp Web session and is **not** suitable for production/business
use — avoid for anything beyond a throwaway demo.)

---

## 4. Environment variables

Create `.env.example` (committed, no secrets) and `.env` (gitignored). Required keys:

```dotenv
# --- Server ---
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
PUBLIC_BASE_URL=https://<your-ngrok-or-domain>   # used in loyalty QR links

# --- MongoDB ---
MONGODB_URI=mongodb://localhost:27017/warungai

# --- WhatsApp Cloud API (Meta) ---
WHATSAPP_TOKEN=                # long-lived access token
WHATSAPP_PHONE_NUMBER_ID=      # from Meta App dashboard
WHATSAPP_VERIFY_TOKEN=         # arbitrary string you set; used on webhook GET handshake
WHATSAPP_APP_SECRET=           # for X-Hub-Signature-256 verification

# --- Google Cloud (AI) ---
GOOGLE_APPLICATION_CREDENTIALS=./secrets/gcp-service-account.json   # gitignored path
GCP_PROJECT_ID=
GCP_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash   # cost/latency-friendly; bump if accuracy needs it

# --- Feature flags / limits (tier gating) ---
FREE_TIER_DAILY_TXN_CAP=50
KOIN_BOT_ENABLED=true
```

**Rules:**
- Never commit `.env`, `secrets/`, or any service-account JSON. Add them to `.gitignore` in Phase 0.
- Read env only through `src/config/` — never `process.env` scattered across the code.
- Fail fast on startup if a required var is missing (validate config with Zod).

---

## 5. Decision log

### D-1 — Gemini over legacy Natural Language API for extraction
The proposal lists GCP Natural Language API for entity extraction and Vertex AI as
*fallback*. In practice the legacy NL API does generic entity/sentiment analysis and is
poor at the custom, domain-specific extraction we need ("laku 3 indomie" → structured
line items with shop-specific catalog resolution). A single Gemini call with the shop
catalog in context does both the primary extraction **and** the ambiguous-message
fallback, with strict JSON output. **Decision:** Gemini (Vertex AI) is the primary
extractor; the "fallback" is simply a second Gemini pass with more context / a clarifying
prompt. This stays within the proposal's "GCP AI Layer" framing.

### D-2 — Meta Cloud API direct for MVP
A BSP contract takes time and money — unrealistic for the competition timeline. Meta's
Cloud API offers a free test number and conversation allowance, supports webhooks, voice
media download, and templates. **Decision:** build on Cloud API behind a `messaging/`
adapter so a BSP swap is a single-module change.

### D-3 — node-cron for MVP scheduling
Cloud Scheduler is the production target but adds infra setup. **Decision:** `node-cron`
invokes the same exported job functions Cloud Scheduler will later call via HTTP. Jobs are
written as pure callable functions, not coupled to the scheduler.

### D-4 — MongoDB aggregation before BigQuery
Single-shop dashboards don't need a warehouse. **Decision:** MVP dashboard reads MongoDB
aggregations; the data model keeps transactions in an append-friendly shape so a future
BigQuery export is straightforward.

---

## 6. Setup checklist (Phase 0)

1. `npm init`, set `"type": "module"`, Node engine `>=20`.
2. Install runtime + dev deps (§3); configure ESLint + Prettier.
3. Create `.env.example`, `.env`, `.gitignore` (node_modules, .env, secrets/, *.json creds, logs).
4. Provision a free MongoDB (local or Atlas); set `MONGODB_URI`.
5. Create a Meta app → add WhatsApp product → get test number, `PHONE_NUMBER_ID`, temporary token; set verify token.
6. Create a GCP project → enable **Speech-to-Text** + **Vertex AI** APIs → download a service-account key into `secrets/`.
7. Scaffold the `src/` tree (see [`CONVENTIONS.md`](./CONVENTIONS.md)).
8. Implement config loader with Zod validation that fails fast.
9. `npm run dev` boots; `GET /health` returns `200`.

Detailed acceptance gate: Phase 0 in [`PHASES.md`](./PHASES.md).
