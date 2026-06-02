import { config } from '../config/index.js';
import { captureStore } from './capture.js';
import { sendN8nText } from './n8n.js';

function toWhatsAppPhone(phone) {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

async function sendCloudMessage(payload) {
  const url = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function sendCloudText(to, body) {
  return sendCloudMessage({
    messaging_product: 'whatsapp',
    to: toWhatsAppPhone(to),
    type: 'text',
    text: { body },
  });
}

// Single send facade. Dispatches to the configured transport so the rest of the
// codebase (router, services, jobs) never needs to know which provider is active.
export async function sendText(to, body) {
  const sink = captureStore.getStore();
  if (sink) {
    sink.push({ to, body });
    return { captured: true };
  }

  if (config.whatsapp.provider === 'n8n') {
    return sendN8nText(to, body);
  }

  return sendCloudText(to, body);
}
