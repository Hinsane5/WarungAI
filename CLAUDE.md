# CLAUDE.md

**WarungAI** — AI-powered conversational POS & Smart CRM inside WhatsApp, for Indonesian
*warung kelontong*. Node.js + Express · MongoDB · WhatsApp Cloud API · Google Gemini + GCP
Speech-to-Text.

📖 **All project documentation lives in [`DOCS/`](./DOCS/). Read it before doing anything.**

**Start here, in order:**
1. [`DOCS/CLAUDE.md`](./DOCS/CLAUDE.md) — how to work in this repo (operating instructions).
2. [`DOCS/PHASES.md`](./DOCS/PHASES.md) — the phase-by-phase build plan; find the current phase.
3. [`DOCS/PRD.md`](./DOCS/PRD.md) — product requirements & acceptance criteria.
4. [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md), [`DOCS/DATA_MODEL.md`](./DOCS/DATA_MODEL.md), [`DOCS/AI_INTEGRATION.md`](./DOCS/AI_INTEGRATION.md), [`DOCS/WHATSAPP_INTEGRATION.md`](./DOCS/WHATSAPP_INTEGRATION.md) — per-layer specs.
5. [`DOCS/CONVENTIONS.md`](./DOCS/CONVENTIONS.md) — code standards.

**Non-negotiable rules** (full detail in [`DOCS/CLAUDE.md`](./DOCS/CLAUDE.md)):
- Work phases in order; respect each phase's Definition of Done.
- `POST /webhook` always returns `200` fast — never surface internal errors as non-200.
- No transaction touches stock/cash until the owner confirms (Y/T). Human-in-the-loop on money.
- Credit scoring / restock / RFM / totals are **deterministic** — never LLM-driven.
- All WhatsApp sends go through `src/messaging/`; validate AI output with Zod.
- Secrets via env only; never commit `.env` or `secrets/`.
