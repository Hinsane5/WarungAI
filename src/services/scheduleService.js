import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function defaultSchedule() {
  const [minute, hour] = String(config.jobs.nightlyCron).split(/\s+/);
  return { hour: Number(hour) || 1, minute: Number(minute) || 0 };
}

// Format a shop's daily evaluation time as HH:MM (marking the global default if unset).
export function formatSchedule(shop) {
  const schedule = shop.evaluationSchedule;
  if (schedule && schedule.hour != null) {
    return `${pad(schedule.hour)}:${pad(schedule.minute ?? 0)}`;
  }
  const fallback = defaultSchedule();
  return `${pad(fallback.hour)}:${pad(fallback.minute)} (default)`;
}

// Recognize the owner command to set/check the daily evaluation time. Returns:
//   null            -> not a schedule command
//   { query: true } -> owner asked for the current schedule
//   { invalid:true } -> a set command with an unparseable/out-of-range time
//   { hour, minute } -> a valid new time
// Examples: "jadwal evaluasi 19.00", "ganti jadwal evaluasi harian 19:30", "cek jadwal evaluasi".
export function parseScheduleCommand(text) {
  const raw = String(text ?? '').trim();
  const head = raw.match(
    /^(?:ganti|atur|set|ubah|cek|lihat)?\s*jadwal\s+evaluasi(?:\s+harian)?\s*(.*)$/iu,
  );
  if (!head) {
    return null;
  }

  const rest = head[1].trim();
  if (!rest) {
    return { query: true };
  }

  const time = rest.match(/^(?:jam\s+|pukul\s+|ke\s+|menjadi\s+)?(\d{1,2})(?:[.:](\d{1,2}))?$/iu);
  if (!time) {
    return { invalid: true };
  }

  const hour = Number(time[1]);
  const minute = time[2] != null ? Number(time[2]) : 0;
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) {
    return { invalid: true };
  }

  return { hour, minute };
}

export async function handleScheduleCommand({ shop, message }) {
  const parsed = parseScheduleCommand(message.text);

  if (parsed.query) {
    await sendText(
      message.from,
      `Jadwal evaluasi harian warung: ${formatSchedule(shop)} WIB.\nUbah dengan: "jadwal evaluasi 19.00".`,
    );
    return { action: 'schedule_query' };
  }

  if (parsed.invalid) {
    await sendText(
      message.from,
      'Format jam belum tepat. Contoh: "jadwal evaluasi 19.00" (jam 7 malam).',
    );
    return { action: 'schedule_invalid' };
  }

  shop.evaluationSchedule = { hour: parsed.hour, minute: parsed.minute };
  await shop.save();
  await sendText(
    message.from,
    `Oke! Evaluasi harian warung diatur ke jam ${pad(parsed.hour)}:${pad(
      parsed.minute,
    )} WIB setiap hari.`,
  );
  return { action: 'schedule_set', hour: parsed.hour, minute: parsed.minute };
}
