// Dev helper: send a fake WhatsApp inbound message to the LOCAL webhook with a
// valid X-Hub-Signature-256, so you can test routing/onboarding without WhatsApp.
//
// Usage:
//   node scripts/simulate-webhook.mjs "masuk 2 dus indomie"            # default sender
//   node scripts/simulate-webhook.mjs "halo" 6289900001111             # custom sender
//   HOST=http://localhost:3000 node scripts/simulate-webhook.mjs "hi"  # custom host
//
// Notes:
// - The outbound reply (sendText → Graph API) will only succeed with real Meta
//   credentials and an allowed recipient. The DB writes (Shop/Session) happen
//   first, so onboarding is testable even if the reply fails. Inspect with:
//   node scripts/inspect-db.mjs
import { createHmac } from 'node:crypto';
import 'dotenv/config';

const text = process.argv[2] ?? 'masuk 2 dus indomie';
const from = process.argv[3] ?? '6289900001111';
const host = process.env.HOST ?? 'http://localhost:3000';

const appSecret = process.env.WHATSAPP_APP_SECRET;
if (!appSecret) {
  console.error('WHATSAPP_APP_SECRET missing from .env — cannot sign the request.');
  process.exit(1);
}

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-sim',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551234567', phone_number_id: 'sim' },
            contacts: [{ wa_id: from, profile: { name: 'Tester Lokal' } }],
            messages: [
              {
                from,
                id: `wamid.sim-${Date.now()}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(payload);
const signature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

const response = await fetch(`${host}/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  body: rawBody,
});

console.log(`→ POST ${host}/webhook`);
console.log(`  sender:  +${from}`);
console.log(`  message: "${text}"`);
console.log(`← HTTP ${response.status} ${await response.text()}`);
console.log('\nNow run:  node scripts/inspect-db.mjs   to see the Shop/Session created.');
