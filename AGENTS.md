# AGENTS.md

**WarungAI** — AI conversational POS & Smart CRM inside WhatsApp, for Indonesian *warung*.
Node.js + Express · MongoDB · WhatsApp Cloud API · Gemini (Vertex AI) + GCP Speech-to-Text.

📖 **All documentation lives in [`DOCS/`](./DOCS/). It is the source of truth — read it first.**

The full agent guide is [`DOCS/AGENTS.md`](./DOCS/AGENTS.md). Quick orientation:

- **Build plan:** [`DOCS/PHASES.md`](./DOCS/PHASES.md) — work phases in order; each has a Definition of Done.
- **What to build:** [`DOCS/PRD.md`](./DOCS/PRD.md) — requirements & acceptance criteria.
- **How it's designed:** [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md), [`DOCS/DATA_MODEL.md`](./DOCS/DATA_MODEL.md), [`DOCS/AI_INTEGRATION.md`](./DOCS/AI_INTEGRATION.md), [`DOCS/WHATSAPP_INTEGRATION.md`](./DOCS/WHATSAPP_INTEGRATION.md).
- **How code must look:** [`DOCS/CONVENTIONS.md`](./DOCS/CONVENTIONS.md).

**Hard rules:** webhook always returns 200 (process async); human confirms money (Y/T) before
commit; money/credit/restock logic is deterministic (no LLM); all WhatsApp sends via
`src/messaging/`; validate AI output with Zod; secrets via env only. See
[`DOCS/AGENTS.md`](./DOCS/AGENTS.md#hard-rules-non-negotiable) for the complete list.
