# CLAUDE.md — WarungAI

Operating instructions for Claude Code (and other AI coding agents) working in this repo.
Read this **first**, every session.

> **Note on placement:** Claude Code auto-loads a `CLAUDE.md` from the **project root**. This
> file is the canonical copy in `DOCS/`. Copy or symlink it to the repo root (`../CLAUDE.md`)
> so it's auto-loaded, or keep root `CLAUDE.md` as a one-line pointer to this file. Either
> way, the content below governs how agents work here.

---

## What this project is

**WarungAI** — an AI-powered conversational POS & Smart CRM that runs entirely inside
WhatsApp, for Indonesian *warung kelontong* (small shops). Owners record stock and sales by
sending a text or voice note; AI extracts structured data and updates the books. It also
handles debt (*kasbon*) with credit scoring, loyalty via QR, and proactive restock
reminders. Full context: [`README.md`](./README.md) and [`PRD.md`](./PRD.md).

**Stack:** Node.js 20 + Express · MongoDB (Mongoose) · WhatsApp Cloud API · Google Gemini
(Vertex AI) + GCP Speech-to-Text · `node-cron`. See [`TECH_STACK.md`](./TECH_STACK.md).

---

## Read order (don't skip)

1. **This file** — how to work.
2. [`PHASES.md`](./PHASES.md) — find the current phase; that's your scope.
3. [`PRD.md`](./PRD.md) — the requirement behind the task (story IDs like `F1-S3`).
4. The doc for the layer you're touching: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DATA_MODEL.md`](./DATA_MODEL.md), [`AI_INTEGRATION.md`](./AI_INTEGRATION.md), [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md).
5. [`CONVENTIONS.md`](./CONVENTIONS.md) — how the code must look.

---

## How to work here

### The loop
1. **Locate the phase.** The current phase = the lowest one in [`PHASES.md`](./PHASES.md) whose Definition of Done isn't fully met.
2. **Take the smallest next task** within that phase. Don't jump ahead.
3. **Implement** per the relevant doc + [`CONVENTIONS.md`](./CONVENTIONS.md).
4. **Verify** against the task's acceptance criteria / DoD. Run lint + tests.
5. **Report** what you did, which AC it satisfied, and what's next. Update the phase tracker.

### Golden rules
- **Phases are ordered.** Don't build Phase 5 logic while Phase 3's DoD is red.
- **The webhook must never return non-200 on an internal error.** Ack `200` first, process async in try/catch. (Risk: Meta disables slow/erroring webhooks.)
- **Never commit money silently.** Every transaction is confirmed by the owner (Y/T) before it touches stock/cash. Human-in-the-loop is a hard requirement (Risk R-01).
- **Money/credit/restock/RFM logic is deterministic** — no LLM. The LLM only turns messy language into structured data. (See [`AI_INTEGRATION.md`](./AI_INTEGRATION.md#1-ai-responsibilities-map).)
- **All WhatsApp sends go through `messaging/`.** Never call the Graph API from a controller/service directly — quota metering lives in one place.
- **Validate AI output with Zod** before using it. The model can return anything.
- **Respect layering** (controllers → services → models; AI only in `ai/`). See [`CONVENTIONS.md`](./CONVENTIONS.md#layering-rules-enforced-in-review).
- **Secrets only via env.** Never read `process.env` outside `config/`; never commit `.env`/`secrets/`.
- **Idempotency:** dedupe inbound webhooks by `message.id`.

### When something's unclear
- If the PRD/architecture is silent or contradictory, **update the doc first**, then code. Don't invent behavior that diverges silently.
- If a decision is genuinely the user's (scope, money model, provider), ask — don't guess on irreversible things.

---

## Commands

> These exist once Phase 0 is done. Until then, the first job is to create them.

```bash
npm run dev      # start server with reload (nodemon)
npm start        # start server
npm test         # run unit + integration tests
npm run lint     # eslint
npm run format   # prettier --write
```

Local WhatsApp testing needs a tunnel: `npx ngrok http 3000`, then register the HTTPS URL
in the Meta dashboard. See [`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md).

---

## Definition of Done for any change

- [ ] Satisfies the referenced PRD acceptance criteria.
- [ ] Lint + tests pass; new logic has tests (deterministic logic especially).
- [ ] No secrets added to the repo; no `process.env` outside `config/`.
- [ ] Webhook path stays resilient (acks 200, degrades gracefully).
- [ ] Docs updated if behavior changed; phase tracker updated if a phase moved.

---

## Anti-patterns (do not do these)

- ❌ Returning a 4xx/5xx from `POST /webhook` when an internal step fails.
- ❌ Auto-rejecting a customer's kasbon, or auto-sending dunning messages without owner approval.
- ❌ Using an LLM to compute credit scores, restock dates, or money totals.
- ❌ Calling Gemini/STT/WhatsApp from a controller.
- ❌ Persisting a transaction before the owner confirms (Y).
- ❌ Counting `pending`/`cancelled` transactions in reports.
- ❌ Broadcasting to customers without checking quota + opt-in + (out-of-window) approved template.
- ❌ Hardcoding limits/thresholds that belong in config.
- ❌ Committing/pushing without the user asking (and never to the default branch directly).

---

## Useful gstack skills for this repo

- `/investigate` — debugging a broken flow (root-cause first).
- `/review` — pre-PR diff review.
- `/qa` — test the running flows and fix bugs.
- `/cso` — security audit before the demo (Phase 9).
- `/ship` then `/land-and-deploy` — create PR, merge, deploy.
- `/document-release` — sync docs after shipping a phase.
