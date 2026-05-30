# Product Requirements Document — WarungAI

**Version:** 1.0 · **Owner:** MOAS Team · **Last updated:** 2026-05-30
**Status:** Approved for MVP build

> This PRD is the contract for *what* to build. For *how*, see [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> and [`PHASES.md`](./PHASES.md). When code and PRD disagree, the PRD wins — update the PRD
> first if requirements genuinely changed.

---

## 1. Problem statement

Traditional Indonesian *warung kelontong* (small grocery shops) handle 70%+ of daily FMCG
transactions but are disappearing (6.1M → 3.9M, 2007–2025). The killer is not price
competition with minimarkets — it is **undetected financial leakage**:

1. **Shrinkage** — stock that is lost, expired, or slow-moving, silently eating capital.
2. **Bad debt (*kasbon*)** — informal credit the owner is too socially awkward to collect.

Existing POS apps fail because their **tap-and-search UI is slower than pen-and-paper**
during rush hour, producing high churn. The owner needs frictionless recording that fits
their existing habit, not a new app to learn.

### Core insight

The owner already lives in WhatsApp (Indonesia = #3 globally, 112M active users, ~1h52m/day).
**Move the operational interface into WhatsApp and remove all data-entry friction with AI.**

---

## 2. Goals & non-goals

### Goals (MVP)
- G1 — Record a transaction in **under 10 seconds** via text *or* voice, on a low-end phone over unstable internet.
- G2 — Extract structured data (`action`, `item`, `qty`, `price`) from messy natural-language Indonesian (incl. local abbreviations) with **≥95% accuracy** on the beta dataset.
- G3 — Digitize *kasbon* with behavioral risk scoring and **owner-in-the-loop** collection (never auto-send a dunning message without owner approval in MVP).
- G4 — Let customers self-register loyalty via a **static QR → lightweight web app**, with zero app install.
- G5 — Proactively remind customers to restock routine goods and warn owners about stock-outs/expiry.

### Non-goals (explicitly out of scope for MVP)
- ❌ Payment processing / QRIS integration (Q4 2026 phase).
- ❌ Group-buying / *kulakan bersama* (Q1 2027 phase).
- ❌ Paid FMCG data dashboard for principals (Q1 2027).
- ❌ Native mobile app of any kind — WhatsApp + web only.
- ❌ Multi-language beyond Indonesian + common local abbreviations.
- ❌ Fully autonomous debt collection (must stay owner-in-the-loop in MVP).

---

## 3. Personas

### 3.1 Shop owners (primary users)

| Persona | Profile | Key pain | Feature that saves them |
|---------|---------|----------|------------------------|
| **Pak Joko, 52** — solo multitasker | Runs a busy sembako shop 10+ yrs; uses phone only for WA/social | Can't type on a small screen while serving; unexpected stock-outs | **Conversational POS** (voice: "terjual 5kg beras" with hands full) |
| **Ibu Sri, 43** — socially pressured | Home-front shop; friendly with all neighbors | Too awkward to chase neighbors for *kasbon* | **Smart Kasbon + Credit Scoring** (auto-drafted reminders) |
| **Mas Rio, 28** — visionary heir | Gen-2 sembako agent; wants to beat minimarkets | Capital stuck in slow-moving goods; losing customers | **Predictive Restock + Proactive CRM** |

### 3.2 Customers (secondary users)

| Persona | Profile | Key pain | Feature that saves them |
|---------|---------|----------|------------------------|
| **Ibu Sari, 32** — household manager | Mother of 2, tight budget, loyal, active WA user | Runs out of gas/water gallon unexpectedly | **Proactive CRM** restock reminders + WA ordering |
| **Mas Andi, 26** — variable income | Ojol driver/freelancer; *kasbon* for daily smokes & coffee | Loses track of debt, shocked at month-end total | **Smart Kasbon** — debt detail via WA each time |
| **Kevin, 21** — practical | Gen-Z student/freelancer; loves fast, modern tech | Avoids slow manual warung service | **Frictionless Loyalty** (scan QR → instant WA summary + stamp) |

---

## 4. Features & user stories

Each story has an ID, a narrative, and **acceptance criteria (AC)**. ACs are the test
spec — an agent must satisfy every AC before marking a story done.

### F1 — AI Conversational POS

**F1-S1 — Record stock-in / sale via text**
> As an owner, I send a free-text WhatsApp message describing stock movements, so my inventory and cash update without manual data entry.

- AC1: Owner sends `"masuk 2 dus indomie, laku 1 galon aqua"`; system parses **two** line items with correct `action` (`stock_in` / `sale`), `item`, `qty`, and (if present) `price`.
- AC2: System resolves local abbreviations/aliases (e.g. `"aqua botol gede"` → `Aqua 1500ml`) against the shop's product catalog.
- AC3: Inventory quantities and the cash ledger are updated atomically; a sale decrements stock and adds to cash, a stock-in increments stock and (if cost given) records expense.
- AC4: System replies with a concise confirmation summarizing what was recorded.
- AC5: Round-trip (message received → confirmation sent) completes in **< 10 s** for text.

**F1-S2 — Record via voice note**
> As an owner with full hands, I send a WhatsApp voice note instead of typing.

- AC1: System downloads the WhatsApp audio (OGG/Opus), transcribes it via Speech-to-Text, then runs the same extraction pipeline as F1-S1.
- AC2: If transcription confidence is low, the system still attempts extraction and flags uncertainty in the confirmation.

**F1-S3 — Human-in-the-loop confirmation (Risk R-01 mitigation)**
> As an owner, I confirm what the AI understood so noisy environments don't corrupt my books.

- AC1: For every parsed transaction the bot sends a short confirmation: `"Tercatat: 2 Indomie (masuk), 1 Galon Aqua (laku Rp20.000). Benar? Balas Y / T"`.
- AC2: Reply `Y` (or synonyms) commits; `T` cancels and offers a quick text-correction path.
- AC3: After **2 failed/incorrect** attempts, the system offers a structured fast-text fallback template.
- AC4: Unconfirmed transactions are **not** persisted to the books (held as `pending`).

**F1-S4 — Ambiguous-message fallback**
- AC1: If the primary extractor returns low confidence or no entities, the system routes the message to the **generative fallback** (Gemini) with the catalog as context.
- AC2: If still unresolved, the bot asks a single clarifying question rather than guessing.

### F2 — Smart Kasbon & Behavioral Credit Scoring

**F2-S1 — Record a kasbon (debt)**
> As an owner, I record that a customer took goods on credit.

- AC1: Owner message like `"kasbon budi 2 rokok"` creates/updates a debt record tied to a customer (by name/alias or phone).
- AC2: The kasbon links to the underlying items and amount.

**F2-S2 — Behavioral credit score & warning**
- AC1: When a customer with a poor repayment history attempts new credit, the system computes a risk score using the documented formula (see [`AI_INTEGRATION.md`](./AI_INTEGRATION.md#credit-scoring)) and warns the owner.
- AC2: The warning is **advisory** — it never auto-rejects; the owner decides (owner-in-the-loop).

**F2-S3 — Owner-in-the-loop collection draft**
- AC1: System can draft a polite, ready-to-send reminder message for a debtor; the owner approves before anything is sent.
- AC2: Customers receive their debt detail via WA each time a kasbon is recorded, and a periodic total reminder.

### F3 — Frictionless Loyalty Capture

**F3-S1 — Self-service registration via QR**
> As a customer, I scan a static counter QR and register my WhatsApp number myself.

- AC1: Scanning the QR opens a lightweight web app (works on low-end phones; minimal data).
- AC2: Customer enters their WA number; the number links to the shop and (if available) the current transaction context.
- AC3: After registration the system sends the customer a WhatsApp confirmation with a digital stamp / loyalty points.
- AC4: The QR is **static** (one per shop) — no per-transaction QR generation needed.

**F3-S2 — Loyalty as a comms channel**
- AC1: A registered customer's number becomes the channel for later proactive CRM (promos, restock reminders) — no further manual action from the owner.

### F4 — Proactive CRM & Predictive Restock

**F4-S1 — Predictive restock (owner-facing)**
- AC1: A nightly batch job analyzes per-item sales history to predict when each item will run out (avg daily sales + seasonality) and flags low/expiring stock to the owner.

**F4-S2 — Customer restock reminders**
- AC1: For routine goods (e.g. gas, water gallon), the system predicts a customer's rebuy cycle and sends a WA reminder before they run out.
- AC2: Customers can reply to order directly via WA.

**F4-S3 — RFM segmentation & personalized promo**
- AC1: Customers are segmented by Recency / Frequency / Monetary value; promo content is matched to segment.
- AC2: Broadcast/promo sends are **metered** (the "Koin Bot" / pay-per-blast model) — the system must respect a per-shop quota before sending.

### F5 — Analytics dashboard (web)

**F5-S1 — Owner operational dashboard**
- AC1: A web dashboard visualizes the shop's stock levels, cash flow, top items, and outstanding kasbon.
- AC2: Owner can export a monthly report (Excel) — gated to the Premium tier.

> *Regional aggregate analytics for FMCG distributors is a post-MVP (Q1 2027) goal and out of scope here, but the data model must not preclude it.*

---

## 5. Monetization (informs feature gating)

The build must respect tier gating from day one (even if billing is stubbed):

- **Free (Basic POS):** text/voice POS + kasbon, capped at **50 transactions/day**. No CRM features.
- **Premium (Lite POS) — Rp 15.000/mo:** unlimited POS, Predictive Restock, 1× monthly Excel export.
- **Pay-per-Blast (CRM add-on):** broadcast/promo messages consume prepaid "Koin Bot" credits (e.g. Rp 10.000 = 50 messages). This isolates expensive WhatsApp API cost from the base subscription.
- **B2B (post-MVP):** FMCG data dashboard + targeted promo injection (cross-subsidizes the free tier).

**Implication for agents:** every CRM/broadcast send must check a quota; every POS write on a Free account must check the daily cap. Implement these as guard functions even if limits are configurable/disabled in dev.

---

## 6. Success metrics

| Metric | MVP target (Q3 2026) |
|--------|----------------------|
| Transaction recording time | < 10 s (text), best-effort voice |
| NLP extraction accuracy | ≥ 95% on beta dataset |
| Beta warung acquired | 50 (Tangerang) |
| 30-day retention | > 80% |
| Confirmation-flow correction rate | trending down week-over-week |

---

## 7. Key risks & mitigations

| Code | Risk | Mitigation (must be built in) |
|------|------|-------------------------------|
| R-01 | Noisy environment → Speech-to-Text mis-detects amounts/items | **Human-in-the-loop** confirmation (F1-S3); fast-text fallback after 2 failures |
| R-02 | Owners won't pay for "Koin Bot" CRM quota | Business-model mitigation (B2B subsidy) — *no engineering action*, but keep CRM cost isolated via metering |
| R-03 | Meta changes API pricing or flags the bot as spam | Use official BSP/Cloud API only; respect template/opt-in rules; keep a lightweight **PWA fallback** path in the architecture |

---

## 8. Roadmap

| Quarter | Codename | Scope | Targets |
|---------|----------|-------|---------|
| **Q3 2026** | Grinding | MVP: voice/text POS, kasbon, loyalty, predictive restock. 50 beta warung (Tangerang). NLP hardening. | NLP ≥95%, retention >80% |
| **Q4 2026** | Go-Live | QRIS payments in-bot, expansion to 500 warung (Jabodetabek), "Duta WarungAI" program | 500 warung, GTV Rp50M, 20% premium conversion |
| **Q1 2027** | Flywheel | Group-buying, paid FMCG data dashboard for principals | 5.000+ warung, B2B contracts, break-even |

---

## 9. Open questions

Track unknowns here; resolve before the affected phase:

- WhatsApp provider for MVP: Meta Cloud API direct (free test tier) vs BSP? → **Decision in [`TECH_STACK.md`](./TECH_STACK.md); default = Meta Cloud API for MVP.**
- Primary extractor: legacy GCP Natural Language API vs Gemini? → **Decision: Gemini (Vertex AI) as primary; see [`AI_INTEGRATION.md`](./AI_INTEGRATION.md).**
- Catalog bootstrapping: how does a new shop seed its product list? → onboarding flow, define in Phase 2.
