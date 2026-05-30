# Conventions — WarungAI

**Version:** 1.0 · **Last updated:** 2026-05-30

Coding standards every contributor (human or agent) follows. Consistency matters more than
any single preference here — when in doubt, match surrounding code.

---

## 1. Project structure

```
warung-ai/
├── src/
│   ├── config/         # index.js (env+Zod), db.js (mongoose connect)
│   ├── routes/         # webhook.js, loyalty.js, api.js  (route → controller wiring only)
│   ├── controllers/    # thin HTTP handlers: validate input, call service, respond
│   ├── services/       # business logic: shop, session, pos, product, kasbon, loyalty, crm, analytics
│   ├── ai/             # sttClient.js, extractor.js, prompts/, schemas.js
│   ├── models/         # mongoose: Shop, Product, Transaction, Customer, Kasbon, Session
│   ├── jobs/           # predictiveRestock, creditScoreRefresh, crmNotifier, index.js
│   ├── messaging/      # whatsapp.js, media.js, templates.js  (the ONLY place that sends WA)
│   ├── intents/        # router.js, classifier.js
│   ├── middleware/     # verifySignature.js, tierGate.js, quotaGuard.js, errorHandler.js
│   ├── utils/          # logger.js, money.js, errors.js
│   └── app.js          # express wiring (no business logic)
├── web/
│   ├── loyalty/        # static phone-capture page
│   └── dashboard/      # owner analytics UI
├── tests/
│   ├── fixtures/       # webhooks/, extraction/  (labeled eval set)
│   └── *.test.js
├── secrets/            # gitignored — GCP service account etc.
├── .env / .env.example
├── server.js           # entrypoint: start app + register cron jobs
└── package.json
```

### Layering rules (enforced in review)
- **Controllers** never touch the DB or AI directly — they call services.
- **Services** never parse HTTP/WhatsApp payloads — they receive normalized data.
- **AI** calls only from `ai/` and the owning service — never from controllers.
- **Outbound WhatsApp** only through `messaging/` — so quota metering stays centralized.
- **`process.env`** read only in `config/` — everything else imports from config.

---

## 2. Language & style

- **ES Modules** (`import`/`export`), `"type": "module"`, Node 20+.
- `async/await` everywhere; no raw `.then()` chains. Always handle rejections.
- **Prettier** for formatting, **ESLint** for correctness. CI runs both.
- 2-space indent, semicolons, single quotes (whatever Prettier config sets — don't fight it).
- Prefer small pure functions; isolate side effects (DB, network) in services/clients.

## 3. Naming

- Files: `camelCase.js` for modules (`posService.js`), `PascalCase.js` for Mongoose models (`Shop.js`).
- Variables/functions: `camelCase`. Classes/models: `PascalCase`. Constants: `UPPER_SNAKE`.
- Functions are verbs (`commitTransaction`, `resolveProduct`); booleans read as predicates (`isPending`, `hasQuota`).
- DB fields: `camelCase` (see [`DATA_MODEL.md`](./DATA_MODEL.md)).

## 4. Money & quantities

- Store money as **integer IDR** (no decimals — rupiah has no cents in practice). Helpers in `utils/money.js`.
- Never do floating-point arithmetic on money. Format for display only at the edge.
- Phone numbers in **E.164** (`+62…`). Normalize on every inbound boundary.

## 5. Error handling

- Define typed errors in `utils/errors.js` (e.g. `ValidationError`, `NotFoundError`, `QuotaExceededError`).
- Webhook path **never** throws to the client: ack `200`, process in try/catch, log failures with a correlation id.
- Validate all trust-boundary inputs (webhook payloads, API bodies, **AI output**) with Zod before use.
- Fail fast on misconfiguration at startup; degrade gracefully at runtime.

## 6. Logging

- `pino` structured logs; attach a correlation/request id per inbound message.
- Levels: `error` (needs attention), `warn` (degraded/fallback used), `info` (lifecycle), `debug` (dev detail).
- **Never** log secrets/tokens. **Never** log full `rawMessage`/PII at `info` in production.

## 7. Configuration

- One Zod-validated config object from `config/index.js`. Required vars listed in [`TECH_STACK.md`](./TECH_STACK.md#4-environment-variables).
- Feature limits (daily cap, Koin Bot, confidence threshold) are config, not magic numbers in code.

## 8. Testing

- **Unit:** services and deterministic logic (credit scoring, restock, RFM, money) — these must be thoroughly tested.
- **Integration:** webhook routing via fixture payloads + Supertest (no live WhatsApp).
- **Eval:** extraction accuracy against `tests/fixtures/extraction/` — guards the ≥95% target.
- Mock external calls (WhatsApp, STT, Gemini) in tests; never hit live APIs in CI.
- A bug fix adds a regression test.

## 9. Git & commits

- This repo is **not yet a git repo** — `git init` in Phase 0 before the first commit.
- Branch off the default branch; never commit directly to it. Use the `/ship` skill to create PRs.
- Conventional-ish messages referencing PRD stories:
  - `feat(pos): atomic commit on Y confirmation (F1-S3)`
  - `fix(webhook): dedupe redelivered messages by id`
  - `docs(phases): mark Phase 3 done`
- Commit/push only when the user asks. Co-author trailer per repo policy.
- Never commit `.env`, `secrets/`, tokens, or service-account JSON.

## 10. Security baseline

- Verify `X-Hub-Signature-256` on every webhook POST.
- Secrets only via env; `secrets/` and `.env` gitignored.
- Don't expose internal errors/stack traces to external responses.
- Respect customer `optInBroadcast` and quota guards on every proactive send.
- Run `/cso` before the demo (Phase 9).

## 11. Documentation

- `DOCS/` is the source of truth. If behavior diverges from a doc, update the doc in the same change.
- Keep diagrams as Mermaid (text, version-controlled).
- When a phase completes, update the tracker in [`PHASES.md`](./PHASES.md) and run `/document-release` if shipping.
