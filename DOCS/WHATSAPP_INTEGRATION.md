# WhatsApp Integration — WarungAI

**Version:** 1.0 · **Last updated:** 2026-05-30 · **Provider (MVP):** Meta WhatsApp Cloud API

All inbound/outbound WhatsApp logic lives in `src/messaging/`. Controllers and services
talk to WhatsApp **only** through this module, so a future BSP swap (and quota metering)
is centralized.

---

## 1. Provider & setup (MVP)

Meta WhatsApp **Cloud API** (Graph API), free test tier:

1. Create a Meta app → add the **WhatsApp** product.
2. Note the **test phone number**, `PHONE_NUMBER_ID`, and a temporary 24h token (replace with a long-lived token before demo).
3. Set a `WHATSAPP_VERIFY_TOKEN` (any string) for the webhook handshake.
4. Grab the **App Secret** (`WHATSAPP_APP_SECRET`) for signature verification.
5. Expose the local server with `ngrok http 3000` and register `https://…/webhook` in **App Dashboard → WhatsApp → Configuration**, subscribing to `messages`.

Env vars are documented in [`TECH_STACK.md`](./TECH_STACK.md#4-environment-variables).

---

## 2. Webhook: verification (GET)

Meta verifies the endpoint with a GET handshake. Implement in the webhook controller:

```
GET /webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<n>
→ if hub.verify_token === WHATSAPP_VERIFY_TOKEN: respond 200 with hub.challenge (plain text)
→ else: 403
```

---

## 3. Webhook: messages (POST)

**Golden rule: acknowledge with `200` immediately, then process asynchronously.** Meta
retries (and may disable) endpoints that respond slowly or with errors. Never let an AI/DB
error bubble into a non-200 response.

```
POST /webhook
1. Verify X-Hub-Signature-256 (HMAC-SHA256 of the raw body with APP_SECRET). Reject if invalid.
2. Respond 200 OK right away.
3. Hand the payload to an async handler (in-process is fine for MVP).
4. Dedupe on message.id (idempotency) — skip if already processed.
5. Normalize → route by intent.
```

> Capture the **raw request body** (e.g. `express.json({ verify: captureRawBody })`) so the
> HMAC can be computed over exactly what Meta sent.

### Inbound payload shape (simplified)

```jsonc
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "62812xxxxxxx",          // sender phone (no '+')
          "id": "wamid....",                // dedupe key
          "timestamp": "1716000000",
          "type": "text" | "audio" | "interactive" | "button",
          "text": { "body": "masuk 2 dus indomie" },
          "audio": { "id": "<media_id>", "mime_type": "audio/ogg; codecs=opus" }
        }],
        "contacts": [{ "wa_id": "62812...", "profile": { "name": "Bu Sri" } }]
      }
    }]
  }]
}
```

Normalize to an internal shape before routing:

```js
{ from: "+62812...", messageId, type, text, audioMediaId, profileName, timestamp }
```

---

## 4. Handling voice notes

1. `type === "audio"` → take `audio.id`.
2. `GET https://graph.facebook.com/<v>/<media_id>` (Bearer token) → returns a media `url`.
3. Download the `url` **with the auth header** (the URL alone is not public).
4. Transcribe via Speech-to-Text (see [`AI_INTEGRATION.md`](./AI_INTEGRATION.md#2-speech-to-text-voice-notes)).
5. Feed transcript into the extractor; persist `source:"voice"`, `sttConfidence`.

---

## 5. Sending messages (outbound)

All sends go through `messaging/whatsapp.js` → `sendText`, `sendButtons`, `sendTemplate`.

### Free-form vs template (the 24-hour rule)

- **Inside the 24h customer-service window** (after the user messaged you): free-form text/interactive replies are allowed. POS confirmations and replies fall here.
- **Outside the window** (proactive CRM, restock reminders, promos): you **must** use a **pre-approved message template** and the customer must be opted in.

**Implication:** Conversational POS works with free-form replies. Proactive CRM/broadcast
(F4) requires approved templates + opt-in + Koin Bot quota. Build templates for: restock
reminder, kasbon reminder, loyalty stamp confirmation, promo.

### Send text (example contract)

```
POST https://graph.facebook.com/<v>/<PHONE_NUMBER_ID>/messages
Authorization: Bearer <WHATSAPP_TOKEN>
{
  "messaging_product": "whatsapp",
  "to": "62812...",
  "type": "text",
  "text": { "body": "..." }
}
```

### Quota metering (centralized)

Before any **proactive/broadcast** send (not CS-window replies):
1. Check `shop.quotas.koinBotBalance > 0` and `customer.optInBroadcast`.
2. Send → on success decrement balance and record `remindersSent` / send log.
3. On zero balance: skip + notify owner they're out of Koin Bot credits.

Owner-facing CS-window replies and low-stock alerts (in-window) are not metered.

---

## 6. Confirmation (Y/T) flow

The human-in-the-loop guard for Risk R-01. Implemented across `messaging/` + the intent
router + `posService`.

```
1. After extraction → save transaction status:"pending", session → awaiting_confirmation,
   send a concise summary ending with "Benar? Balas Y / T".
   (Prefer interactive reply buttons [Ya] [Tidak] for one-tap UX; accept free-text Y/T too.)
2. Reply "Y"/"ya"/"betul"/button-Ya → commit (atomic stock+cash), session → idle, send success.
3. Reply "T"/"tidak"/"salah"/button-Tidak → cancel pending, session → correcting,
   prompt "Apa yang salah? Kirim ulang dengan benar."
4. failureCount increments on each cancel/re-fail; at 2 → session → fast_text_fallback,
   send the structured template.
5. Stale awaiting_confirmation (no reply within TTL) → expire to idle (don't trap the user).
```

Confirmation copy is concise, in Indonesian, shows the parsed result, and never commits
money silently.

---

## 7. Loyalty web app endpoints

Customer-facing, served by Express (`web/loyalty/`):

```
GET  /loyalty/:slug          → lightweight phone-capture page (shopId from slug)
POST /api/loyalty/register   → { slug, phone } → upsert customer, link, send WA stamp
```

Keep the page tiny (inline CSS, minimal JS, Bootstrap via CDN-or-bundled) for low-end
phones and weak connections. After registration, send the customer a confirmation via §5.

---

## 8. Error handling & resilience checklist

- [ ] Webhook always returns `200` fast; processing is async and wrapped in try/catch.
- [ ] Invalid signature → `403`, logged.
- [ ] Duplicate `message.id` → ignored (idempotent).
- [ ] Media download failure → ask user to resend; don't crash.
- [ ] STT/extraction failure → fallback ladder, then clarifying question; never 500.
- [ ] Outbound send failure → retry once, then log + (for proactive sends) don't decrement quota.
- [ ] All secrets from env; never log tokens or full PII transcripts at info level.

---

## 9. Local development tips

- Use `ngrok http 3000`; update `PUBLIC_BASE_URL` and the Meta webhook URL when the tunnel restarts.
- Keep a Postman/`curl` collection that replays sample inbound webhook payloads to test routing without WhatsApp round-trips (fixtures in `tests/fixtures/webhooks/`).
- Temporary tokens expire in 24h — generate a long-lived token before any demo/judging session.
