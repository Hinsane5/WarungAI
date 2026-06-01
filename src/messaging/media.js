import { config } from '../config/index.js';

async function graphFetch(url) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
    },
  });
}

export async function resolveMediaUrl(mediaId) {
  const url = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${mediaId}`;
  const response = await graphFetch(url);

  if (!response.ok) {
    throw new Error(`WhatsApp media resolve failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();

  if (!payload.url) {
    throw new Error('WhatsApp media resolve response did not include a url');
  }

  return payload.url;
}

export async function downloadMedia(mediaId) {
  const mediaUrl = await resolveMediaUrl(mediaId);
  const response = await graphFetch(mediaUrl);

  if (!response.ok) {
    throw new Error(`WhatsApp media download failed: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
