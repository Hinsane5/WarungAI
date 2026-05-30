# AGENTS.md — WarungAI

Cross-tool guide for any AI coding agent (Claude Code, Cursor, Codex, Copilot, etc.)
working in this repository. This is the vendor-neutral companion to [`CLAUDE.md`](./CLAUDE.md);
the two say the same thing — read whichever your tool loads, and follow both.

> **Placement:** the `AGENTS.md` convention expects this file at the **repo root**. Keep the
> canonical copy here in `DOCS/` and copy/symlink it to `../AGENTS.md` so tools discover it.

---

## TL;DR for agents

- **Project:** WarungAI — AI conversational POS + Smart CRM inside WhatsApp, for Indonesian warung. (See [`README.md`](./README.md).)
- **Stack:** Node 20 + Express, MongoDB/Mongoose, WhatsApp Cloud API, Gemini (Vertex AI) + GCP Speech-to-Text, node-cron.
- **Work the phases in order** — [`PHASES.md`](./PHASES.md) is the build plan; each phase has a hard Definition of Done.
- **Specs are law.** `DOCS/` is the source of truth. Code that diverges from a doc is a bug — fix the code or update the doc (in the same change).

---

## Setup

```bash
npm install
cp .env.example .env          # fill in WhatsApp + GCP + Mongo secrets (see TECH_STACK.md)
npm run dev                   # boots server on PORT (default 3000)
npx ngrok http 3000           # expose webhook for WhatsApp (dev)
```

Required env vars and provider setup: [`TECH_STACK.md`](./TECH_STACK.md#4-environment-variables)
and [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md).

## Build / test / lint

```bash
npm run dev      # dev server (reload)
npm start        # prod start
npm test         # unit + integration (mocks external APIs)
npm run lint     # eslint
npm run format   # prettier
```

CI must pass lint + tests. Tests never call live WhatsApp/Gemini/STT — they use mocks and
fixtures in `tests/fixtures/`.

---

## Hard rules (non-negotiable)

1. **Webhook resilience** — `POST /webhook` always returns `200` fast; process async in try/catch. Never surface an internal error as a non-200.
2. **Human-in-the-loop on money** — no transaction touches stock/cash until the owner confirms (Y/T). (Risk R-01.)
3. **Deterministic money logic** — credit scoring, restock prediction, RFM, and totals are rule-based, not LLM-driven. The LLM only structures messy language.
4. **Centralized messaging** — all WhatsApp sends go through `src/messaging/`; quota + opt-in are checked there.
5. **Validate AI output** — Zod-validate every model response before use.
6. **Layering** — controllers → services → models; AI only in `ai/`; `process.env` only in `config/`.
7. **Idempotency** — dedupe inbound webhooks by `message.id`.
8. **Secrets** — env only; never commit `.env` / `secrets/` / tokens.
9. **Tier/quota gating** — Free-tier daily transaction cap and Koin Bot broadcast quota are enforced as guards.
10. **Git** — `git init` first (Phase 0); branch, don't commit to default; commit/push only when the user asks.

Full list with rationale: [`CLAUDE.md`](./CLAUDE.md) and [`CONVENTIONS.md`](./CONVENTIONS.md).

---

## Where things live

| You're working on… | Read | Code goes in |
|--------------------|------|--------------|
| The build plan / what to do next | [`PHASES.md`](./PHASES.md) | — |
| A requirement / acceptance criteria | [`PRD.md`](./PRD.md) | — |
| System design / flows | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | — |
| DB schemas | [`DATA_MODEL.md`](./DATA_MODEL.md) | `src/models/`, `src/services/` |
| Entity extraction / STT / scoring | [`AI_INTEGRATION.md`](./AI_INTEGRATION.md) | `src/ai/`, services, `src/jobs/` |
| Webhooks / sending / voice / Y-T flow | [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md) | `src/messaging/`, `src/controllers/`, `src/intents/` |
| Code style / structure | [`CONVENTIONS.md`](./CONVENTIONS.md) | everywhere |

---

## Definition of Done (every change)

- Meets the referenced PRD acceptance criteria (cite the story ID, e.g. `F1-S3`).
- Lint + tests green; new deterministic logic is unit-tested.
- No secrets committed; no `process.env` outside `config/`.
- Webhook path stays resilient.
- Relevant doc + the phase tracker in [`PHASES.md`](./PHASES.md) updated.

When unsure about scope or an irreversible/product decision, ask rather than guess. When a
spec is missing or contradictory, fix the spec first, then implement.
