import { config } from '../config/index.js';

function toPlainPhone(phone) {
  return phone?.startsWith('+') ? phone.slice(1) : phone;
}

// Outbound transport when WHATSAPP_PROVIDER=n8n. Posts the reply to an n8n webhook,
// which forwards it to the WhatsApp gateway (e.g. Evolution API). See DOCS/N8N_INTEGRATION.md.
export async function sendN8nText(to, body) {
  if (!config.n8n.outboundUrl) {
    throw new Error('N8N_OUTBOUND_URL is not configured');
  }

  const response = await fetch(config.n8n.outboundUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WarungAI-Secret': config.n8n.outboundSecret,
    },
    body: JSON.stringify({ to: toPlainPhone(to), type: 'text', text: body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`n8n send failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
