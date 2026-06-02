# WarungAI 🏪🤖

**AI-Powered Conversational POS & Smart CRM — running entirely inside WhatsApp.**

> Gunadarma Code Week 2026 · Google Developer Group · **MOAS Team**

WarungAI turns WhatsApp — the app every Indonesian *warung* owner already uses every
day — into a complete point-of-sale and customer-relationship system. No app to
install, no menus to learn, no change to the daily rhythm of running a shop. The owner
just sends a text or voice note ("masuk dua dus indomie, laku satu galon") and AI does
the rest: it updates stock, records cash flow, tracks customer debt (*kasbon*), and
proactively reminds customers to restock.

---

## Why this exists (the 30-second version)

- 🇮🇩 Traditional warung still handle **70%+** of Indonesia's daily FMCG transactions, yet their count fell from **6.1M (2007) → 3.9M (2025)**.
- **82%** of micro-businesses fail from undetected financial leakage — lost/expired stock (*shrinkage*) and bad debt (*kasbon* never collected) — not from lack of customers.
- Conventional POS apps fail here: they create a **high barrier to entry** (tapping, searching items) that *slows down* the owner during rush hour.
- **WarungAI's wedge:** zero learning curve. The interface is WhatsApp. The input is natural language (text or voice). The intelligence is hidden in the backend.

Supports **SDG 8** (Decent Work & Economic Growth) and **SDG 9** (Industry, Innovation & Infrastructure).

---

## The four pillars

| # | Feature | One-liner |
|---|---------|-----------|
| 1 | **AI Conversational POS** | Send text/voice → AI extracts `{action, item, qty, price}` → updates stock & cash in real time. |
| 2 | **Smart Kasbon & Behavioral Credit Scoring** | Digital debt book with rule-based risk scoring + *owner-in-the-loop* auto-drafted reminders that defuse social friction. |
| 3 | **Frictionless Loyalty Capture** | Static QR at the counter → customer self-registers their WhatsApp number → instant digital stamp + opens a proactive comms channel. |
| 4 | **Proactive CRM & Predictive Restock** | Batch jobs analyze history to predict stock-outs/expiry and remind customers to rebuy routine goods (gas, water gallon). |

---

## Tech stack at a glance

- **Runtime:** Node.js 20 LTS + Express (MVC)
- **Messaging:** WhatsApp Cloud API (Meta) — webhook-driven
- **AI:** Google Gemini (Vertex AI) for entity extraction + ambiguous-message fallback; Google Cloud Speech-to-Text for voice notes
- **Database:** MongoDB (Mongoose) — flexible NoSQL schema
- **Scheduling:** `node-cron` (MVP) → Cloud Scheduler (production)
- **Analytics:** MongoDB aggregation (MVP) → BigQuery + Looker Studio (scale)
- **Web (loyalty + dashboard):** HTML / CSS / JS / Bootstrap

See [`TECH_STACK.md`](./TECH_STACK.md) for the full rationale and the proposal-vs-MVP mapping.

---

## Documentation map — start here

This `DOCS/` folder is the **single source of truth** for building WarungAI. Read in this order:

| Doc | Purpose | Read when |
|-----|---------|-----------|
| [`README.md`](./README.md) | This file — overview & index | First |
| [`PRD.md`](./PRD.md) | Product requirements: personas, user stories, features, acceptance criteria, success metrics, scope & non-goals | Before any build decision |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design, layered architecture, sequence/use-case/data-flow diagrams | Before writing code |
| [`TECH_STACK.md`](./TECH_STACK.md) | Technology choices, versions, env vars, proposal↔MVP mapping | Setting up the project |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | MongoDB collections, schemas, indexes, sample docs | Writing models/services |
| [`AI_INTEGRATION.md`](./AI_INTEGRATION.md) | Prompts, extraction JSON contract, fallback logic, credit-scoring formula, RFM | Building the AI layer |
| [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md) | Webhook setup, message/voice handling, confirmation (Y/T) flow, templates | Building messaging (Meta Cloud API path) |
| [`N8N_INTEGRATION.md`](./N8N_INTEGRATION.md) | Alternative WhatsApp transport via n8n + an unofficial gateway (sidesteps Meta verification/country block); the `messaging` provider swap | Wiring WhatsApp via n8n |
| [`DASHBOARD_UI_GUIDE.md`](./DASHBOARD_UI_GUIDE.md) | Visual + build spec for the owner web dashboard: design tokens, components, charts, data contracts, quality bar | Building `web/dashboard/` (Phase 8) |
| [`MOCK_DATA_AND_DASHBOARD_TESTING.md`](./MOCK_DATA_AND_DASHBOARD_TESTING.md) | Verify the GCP pipeline + dashboard with seed/simulator data — **no WhatsApp needed**; `npm run seed` | Testing the flow & dashboard without WhatsApp |
| [`PHASES.md`](./PHASES.md) | **The build roadmap.** Phase-by-phase tasks, deliverables, acceptance gates, agent checklists | Every coding session |
| [`CONVENTIONS.md`](./CONVENTIONS.md) | Folder structure, naming, error handling, git, testing standards | Every coding session |
| [`CLAUDE.md`](./CLAUDE.md) / [`AGENTS.md`](./AGENTS.md) | Operating instructions for AI coding agents working in this repo | Every coding session |

> **For AI coding agents:** read [`CLAUDE.md`](./CLAUDE.md) and [`PHASES.md`](./PHASES.md) first, then pick up the current phase. Do not skip phases. Every phase has an explicit "Definition of Done" — verify it before moving on.

---

## Quickstart (once code exists)

```bash
# 1. Install
npm install

# 2. Configure — copy and fill in secrets
cp .env.example .env

# 3. Run MongoDB (local) or point MONGODB_URI to Atlas
# 4. Start the server (exposes webhook on /webhook)
npm run dev

# 5. Expose locally for the WhatsApp webhook (dev only)
npx ngrok http 3000
# Register the ngrok HTTPS URL in Meta App Dashboard → WhatsApp → Configuration
```

Full setup steps live in [`TECH_STACK.md`](./TECH_STACK.md) and Phase 0 of [`PHASES.md`](./PHASES.md).

---

## Team — MOAS

| Name | Role |
|------|------|
| Darris Felicio Hartanto | Hustler |
| Winsont Desvio Wu | Hustler |
| Nicholas Kenny Hendrawan | Hipster |
| Howard Frelindo Goh | Hacker |

---

## Status

🚧 **Pre-MVP.** Documentation complete; implementation starting at Phase 0. Target: Q3 2026 MVP (50 beta warung in Tangerang). See the roadmap in [`PRD.md`](./PRD.md#roadmap).
