# Manual Testing Guide — WarungAI

How to run the app locally and see your progress by hand. Two paths:

- **Path A — Local simulation** (fastest, no WhatsApp/Meta needed). Use this for day-to-day dev.
- **Path B — Real WhatsApp end-to-end** (proves the full loop; needs Meta creds + a public tunnel).

> Automated tests (`npm test`) already prove the logic. This guide is for *seeing it run* —
> sending a message and watching the database change.

---

## Prerequisites

- Node 20+, dependencies installed (`npm install`).
- A local MongoDB. You have the binary at `~/mongodb-macos-aarch64-8.0.3/bin/mongod`.
- A filled-in `.env` (copy from `.env.example`). For Path A the only value that must be
  real is nothing — even placeholder WhatsApp creds work (the inbound flow is signed with
  `WHATSAPP_APP_SECRET`, and the *outbound* reply is allowed to fail locally).

---

## Path A — Local simulation (recommended)

### 1. Start MongoDB (one terminal)
```bash
npm run db:start          # starts mongod as a single-node replica set (rs0)
```
First time only, in a second terminal, initialize the replica set (enables transactions):
```bash
npm run db:init           # idempotent — says "already initialized" on later runs
```
Leave `db:start` running.

> `db:start` calls `mongod`. If it's not on your `PATH`, either add it once
> (`echo 'export PATH="$HOME/mongodb-macos-aarch64-8.0.3/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`)
> or run with an override: `MONGOD=~/mongodb-macos-aarch64-8.0.3/bin/mongod npm run db:start`.

### 2. Start the server (second terminal)
```bash
npm run dev
```
Confirm it's healthy:
```bash
curl -s http://localhost:3000/health
# → {"status":"ok","db":"connected"}
```
`db:"connected"` means Phase 0 + the DB are good. `db:"connecting"`/`"disconnected"`
means Mongo isn't up.

### 3. Simulate inbound WhatsApp messages (third terminal)
The `scripts/simulate-webhook.mjs` helper builds a realistic Meta webhook payload, signs it
with your `WHATSAPP_APP_SECRET`, and POSTs it to the local webhook.

```bash
# First message from a NEW number → onboards the shop + sends welcome
node scripts/simulate-webhook.mjs "halo warungai" 6281122334455

# Second message from the SAME number → echoes, does NOT create a duplicate shop
node scripts/simulate-webhook.mjs "laku 3 indomie" 6281122334455

# A different new number → a second shop is onboarded
node scripts/simulate-webhook.mjs "masuk 1 dus aqua" 6285599887766
```
Each prints `← HTTP 200 OK`.

### 4. Inspect what was persisted
```bash
node scripts/inspect-db.mjs
```
You should see (this is the current Phase-2 behavior):
- **Shops**: one per unique owner phone, each with a unique `loyaltyQrSlug`, `tier:"free"`, default settings.
- **Sessions**: one per shop, `state:"idle"`.
- **Products / Transactions / Customers / Kasbons**: empty — those start filling in Phase 3+.

Repeating a message from an existing number must **not** add another Shop.

### What "the reply didn't send" means locally
In the server log you'll see `WhatsApp webhook async processing failed`. That's **expected**
on Path A: the bot tries to send the reply via the Meta Graph API to a fake recipient and
fails. The important part — the DB writes — happens *before* the reply, so onboarding still
works. To actually receive the reply on your phone, use Path B.

### Reset the data between tests
```bash
# stop mongod first, then:
rm -rf .local/mongo/*        # wipes the local DB
```

---

## Path B — Real WhatsApp end-to-end

This proves the genuine loop: message the bot from your phone, get a reply.

### 1. Fill in real Meta credentials in `.env`
From the Meta App dashboard → WhatsApp:
- `WHATSAPP_TOKEN` (use a long-lived token; the 24h temp token expires fast)
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN` (any string you choose)
- Add **your own phone number** as an allowed recipient in the test setup.

### 2. Start MongoDB and the server (as in Path A, steps 1–2)

### 3. Expose the server publicly
```bash
npx ngrok http 3000
```
Copy the `https://…ngrok…` URL. Put it in `.env` as `PUBLIC_BASE_URL` (used for loyalty QR
links later), and restart the server.

### 4. Register the webhook in Meta
App dashboard → WhatsApp → Configuration → Edit:
- **Callback URL**: `https://<your-ngrok>/webhook`
- **Verify token**: the same string as `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save** (this hits your `GET /webhook` handshake → should succeed).
- **Subscribe** to the `messages` field.

### 5. Message the bot
Send a WhatsApp message to your test number from your phone. You should get:
- First time: the **welcome** message.
- After that: an **echo** (`Anda menulis: …`).

Then run `node scripts/inspect-db.mjs` to confirm the Shop/Session were created with your
real number.

---

## Where each phase shows up when testing

| Phase | What you can observe manually |
|-------|-------------------------------|
| 0 | `GET /health` → `{status:"ok", db:"connected"}` |
| 1 | Send a text → get an echo; bad signature → 403; webhook always 200 |
| 2 | First message onboards a Shop + Session (welcome msg); repeats don't duplicate |
| 3 (next) | `"masuk 2 dus indomie"` → bot asks `Benar? Y/T` → `Y` updates stock + cash; a Transaction + Product appear in the DB |

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `db:"connecting"` forever | MongoDB isn't running — start `mongod` (Path A step 1). |
| Simulator prints `HTTP 403` | `WHATSAPP_APP_SECRET` in `.env` differs from what the script signs with — they must match. |
| `WhatsApp webhook async processing failed` (Path A) | Expected — outbound reply can't reach a fake recipient. DB writes still happen. |
| Meta "Verify and save" fails (Path B) | `WHATSAPP_VERIFY_TOKEN` mismatch, or ngrok URL/`/webhook` path wrong, or server not running. |
| Real reply never arrives (Path B) | Token expired, recipient not in the allowed list, or wrong `PHONE_NUMBER_ID`. |

---

## Phase 3 prerequisites (set up once)

Phase 3 introduces (a) AI extraction and (b) atomic stock+cash commits. Two one-time setups:

**1. MongoDB transactions** — already handled by the npm scripts above: `npm run db:start`
(now runs with `--replSet rs0`) + `npm run db:init` (once). A single-node replica set is
enough. Alternative: a free **MongoDB Atlas** cluster (already a replica set) — just point
`MONGODB_URI` at it and skip the local replica-set steps.

**2. Gemini API access** — get a key from **Google AI Studio**
(<https://aistudio.google.com/apikey>), add `GEMINI_API_KEY=...` to `.env`. This is the fast
path (no `gcloud`/service account). Full **GCP / Vertex AI** setup is only required in
**Phase 4** for Speech-to-Text. `GCP_PROJECT_ID=replace-me` and a missing service-account
file are fine for Phase 3 text-only work.
