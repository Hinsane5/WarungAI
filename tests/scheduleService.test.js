import { afterEach, describe, expect, it, vi } from 'vitest';

const sendTextMock = vi.hoisted(() => vi.fn());

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

const { parseScheduleCommand, handleScheduleCommand, formatSchedule } = await import(
  '../src/services/scheduleService.js'
);

describe('parseScheduleCommand', () => {
  it('parses a set command with dotted time', () => {
    expect(parseScheduleCommand('jadwal evaluasi 19.00')).toEqual({ hour: 19, minute: 0 });
  });

  it('parses synonyms and colon time', () => {
    expect(parseScheduleCommand('ganti jadwal evaluasi harian 19:30')).toEqual({
      hour: 19,
      minute: 30,
    });
    expect(parseScheduleCommand('atur jadwal evaluasi jam 7')).toEqual({ hour: 7, minute: 0 });
  });

  it('treats a bare command as a query', () => {
    expect(parseScheduleCommand('jadwal evaluasi')).toEqual({ query: true });
    expect(parseScheduleCommand('cek jadwal evaluasi')).toEqual({ query: true });
  });

  it('flags out-of-range times as invalid', () => {
    expect(parseScheduleCommand('jadwal evaluasi 25.00')).toEqual({ invalid: true });
    expect(parseScheduleCommand('jadwal evaluasi 19.99')).toEqual({ invalid: true });
  });

  it('returns null for unrelated messages', () => {
    expect(parseScheduleCommand('laku 2 indomie')).toBeNull();
    expect(parseScheduleCommand('kasbon budi 1 telur')).toBeNull();
  });
});

describe('handleScheduleCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('saves the new schedule and confirms', async () => {
    const shop = { evaluationSchedule: undefined, save: vi.fn().mockResolvedValue(undefined) };
    const result = await handleScheduleCommand({
      shop,
      message: { from: '+62812', text: 'jadwal evaluasi 19.00' },
    });

    expect(shop.evaluationSchedule).toEqual({ hour: 19, minute: 0 });
    expect(shop.save).toHaveBeenCalledOnce();
    expect(sendTextMock).toHaveBeenCalledWith('+62812', expect.stringContaining('19:00'));
    expect(result).toEqual({ action: 'schedule_set', hour: 19, minute: 0 });
  });

  it('answers a query without saving', async () => {
    const shop = {
      evaluationSchedule: { hour: 19, minute: 0 },
      save: vi.fn(),
    };
    const result = await handleScheduleCommand({
      shop,
      message: { from: '+62812', text: 'cek jadwal evaluasi' },
    });

    expect(shop.save).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith('+62812', expect.stringContaining('19:00'));
    expect(result).toEqual({ action: 'schedule_query' });
  });
});

describe('formatSchedule', () => {
  it('formats a set schedule and marks the default', () => {
    expect(formatSchedule({ evaluationSchedule: { hour: 9, minute: 5 } })).toBe('09:05');
    expect(formatSchedule({})).toContain('(default)');
  });
});
