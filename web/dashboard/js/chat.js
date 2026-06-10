/* global Blob, FileReader, MediaRecorder, URLSearchParams, document, localStorage, navigator, window */

const params = new URLSearchParams(window.location.search);
const token = params.get('token') || localStorage.getItem('warungai.dashboardToken') || '';
const messageList = document.querySelector('#messageList');
const messageInput = document.querySelector('#messageInput');
const voiceButton = document.querySelector('#voiceButton');
const sendIcon = document.querySelector('#sendIcon');
const presenceText = document.querySelector('#presenceText');
const backLink = document.querySelector('#backLink');
const customerMessageList = document.querySelector('#customerMessageList');
const customerName = document.querySelector('#customerName');
let customerPlaceholder = document.querySelector('#customerPlaceholder');

let mediaRecorder;
let recordedChunks = [];
let recordingStartedAt = 0;

if (token) {
  localStorage.setItem('warungai.dashboardToken', token);
  backLink.href = `/dashboard?${new URLSearchParams({ token })}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function scrollToBottom() {
  messageList.scrollTop = messageList.scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Render WhatsApp-style formatting: *bold*, _italic_, and line breaks. Escapes HTML first.
function formatWaText(text) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/gu, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/gu, '<em>$1</em>')
    .replaceAll('\n', '<br>');
}

function appendBubble({ direction, text, voice = false, duration = '0:00' }) {
  const bubble = document.createElement('article');
  bubble.className = `bubble bubble--${direction}`;

  if (voice) {
    bubble.innerHTML = `<div class="voice-row">
      <span class="voice-play">▶</span>
      <span class="waveform">${[14, 21, 11, 24, 16, 19, 10, 22, 15, 18, 12, 20]
        .map((height) => `<span style="height:${height}px"></span>`)
        .join('')}</span>
      <span class="voice-duration">${duration}</span>
    </div><time>${nowLabel()}</time>`;
  } else {
    bubble.innerHTML = `<p>${formatWaText(text)}</p><time>${nowLabel()}</time>`;
  }

  messageList.append(bubble);
  scrollToBottom();
  return bubble;
}

// Incoming message on the customer's phone (what the warung sent them).
function appendCustomerBubble({ text, to }) {
  if (customerPlaceholder) {
    customerPlaceholder.remove();
    customerPlaceholder = null;
  }
  if (to) {
    customerName.textContent = String(to).trim();
  }
  const bubble = document.createElement('article');
  bubble.className = 'bubble bubble--in';
  bubble.innerHTML = `<p>${formatWaText(text)}</p><time>${nowLabel()}</time>`;
  customerMessageList.append(bubble);
  customerMessageList.scrollTop = customerMessageList.scrollHeight;
}

function showTyping() {
  presenceText.textContent = 'sedang mengetik...';
  const bubble = document.createElement('article');
  bubble.className = 'bubble bubble--in bubble--typing';
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  messageList.append(bubble);
  scrollToBottom();
  return bubble;
}

function hideTyping(typingBubble) {
  typingBubble?.remove();
  presenceText.textContent = 'online';
}

function updateSendMode() {
  const hasText = messageInput.value.trim().length > 0;
  sendIcon.textContent = hasText ? '➤' : '●';
  voiceButton.setAttribute('aria-label', hasText ? 'Kirim pesan' : 'Rekam voice note');
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function postChat(payload) {
  if (!token) {
    throw new Error('dashboard_token_required');
  }

  const query = new URLSearchParams({ token });
  const response = await fetch(`/api/chat/send?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'chat_failed');
  }

  return body;
}

async function sendPayload(payload) {
  const typing = showTyping();
  try {
    const result = await postChat(payload);
    hideTyping(typing);
    for (const reply of result.replies ?? []) {
      appendBubble({ direction: 'in', text: reply });
    }
    for (const customerMessage of result.customerMessages ?? []) {
      appendCustomerBubble({ text: customerMessage.body, to: customerMessage.to });
    }
  } catch (error) {
    hideTyping(typing);
    appendBubble({
      direction: 'in',
      text:
        error.message === 'dashboard_token_required'
          ? 'Dashboard token belum ada. Buka chat dari dashboard yang sudah memakai token.'
          : 'Pesan belum bisa diproses. Coba ulangi sebentar lagi.',
    });
  }
}

async function sendTextMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';
  updateSendMode();
  appendBubble({ direction: 'out', text });
  await sendPayload({ text });
}

function supportedMimeType() {
  const choices = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function formatDuration(milliseconds) {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  mediaRecorder.stop();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    appendBubble({ direction: 'in', text: 'Browser belum mendukung rekam voice note.' });
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  const mimeType = supportedMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recordingStartedAt = Date.now();
  voiceButton.classList.add('is-recording');
  sendIcon.textContent = '■';
  presenceText.textContent = 'merekam voice note...';

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });

  mediaRecorder.addEventListener('stop', async () => {
    stream.getTracks().forEach((track) => track.stop());
    voiceButton.classList.remove('is-recording');
    updateSendMode();
    presenceText.textContent = 'online';

    const blob = new Blob(recordedChunks, {
      type: mediaRecorder.mimeType || mimeType || 'audio/webm',
    });
    const duration = formatDuration(Date.now() - recordingStartedAt);
    appendBubble({ direction: 'out', voice: true, duration });
    await sendPayload({ audioBase64: await blobToBase64(blob), mimeType: blob.type });
  });

  mediaRecorder.start();
}

voiceButton.addEventListener('click', async () => {
  if (messageInput.value.trim()) {
    await sendTextMessage();
    return;
  }

  if (mediaRecorder?.state === 'recording') {
    await stopRecording();
    return;
  }

  try {
    await startRecording();
  } catch {
    appendBubble({ direction: 'in', text: 'Microphone belum bisa dipakai.' });
    voiceButton.classList.remove('is-recording');
    updateSendMode();
    presenceText.textContent = 'online';
  }
});

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 110)}px`;
  updateSendMode();
});

messageInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    await sendTextMessage();
  }
});

document.querySelector('article.bubble time').textContent = nowLabel();
updateSendMode();
scrollToBottom();
