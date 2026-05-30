import { config } from '../config/index.js';

const GRAPH_API_VERSION = 'v21.0';

function toWhatsAppPhone(phone) {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

async function sendWhatsAppMessage(payload) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.whatsapp.phoneNumberId}/messages`;
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

export async function sendText(to, body) {
  return sendWhatsAppMessage({
    messaging_product: 'whatsapp',
    to: toWhatsAppPhone(to),
    type: 'text',
    text: { body },
  });
}
