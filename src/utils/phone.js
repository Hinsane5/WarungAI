export function normalizePhone(phone) {
  if (!phone) {
    return null;
  }

  const digits = String(phone).replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    return digits;
  }

  return `+${digits}`;
}
