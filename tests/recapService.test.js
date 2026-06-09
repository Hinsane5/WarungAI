import { afterEach, describe, expect, it, vi } from 'vitest';

const getDailyRecapMock = vi.hoisted(() => vi.fn());
const sendTextMock = vi.hoisted(() => vi.fn());
const notifyOwnerMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/analyticsService.js', () => ({ getDailyRecap: getDailyRecapMock }));
vi.mock('../src/messaging/whatsapp.js', () => ({ sendText: sendTextMock }));
vi.mock('../src/services/broadcastService.js', () => ({ notifyOwner: notifyOwnerMock }));

const { formatDailyRecap, parseRecapCommand, handleRecapCommand, sendDailyRecap } = await import(
  '../src/services/recapService.js'
);

afterEach(() => vi.clearAllMocks());

describe('formatDailyRecap', () => {
  it('renders a tidy multi-line recap with date, money, and bulleted low stock', () => {
    const text = formatDailyRecap({
      date: 'Selasa, 9 Juni 2026',
      omzet: 487000,
      txnCount: 38,
      kasbonBaru: 50000,
      lowStock: ['Indomie', 'Aqua'],
    });
    const lines = text.split('\n');
    expect(text).toContain('*Rekap Hari Ini*');
    expect(text).toContain('Selasa, 9 Juni 2026');
    expect(text).toMatch(/\*Omzet\* : Rp.?487\.000/u);
    expect(text).toContain('*Transaksi* : 38');
    expect(text).toMatch(/\*Kasbon baru\* : Rp.?50\.000/u);
    expect(text).toContain('*Stok Menipis* :');
    // each low-stock item on its own bullet line
    expect(lines).toContain('- Indomie');
    expect(lines).toContain('- Aqua');
  });

  it("says 'tidak ada' when nothing is low on stock", () => {
    expect(
      formatDailyRecap({ date: 'Selasa, 9 Juni 2026', omzet: 0, txnCount: 0, kasbonBaru: 0, lowStock: [] }),
    ).toContain('*Stok Menipis* : tidak ada');
  });
});

describe('parseRecapCommand', () => {
  it.each(['rekap', 'rekap sekarang', 'REKAP Sekarang', 'rekap hari ini', '  rekap  '])(
    'matches "%s"',
    (text) => expect(parseRecapCommand(text)).toBe(true),
  );

  it.each(['rekap stok', 'rekapan', 'laku 2 indomie', 'kasbon budi'])(
    'does not match "%s"',
    (text) => expect(parseRecapCommand(text)).toBe(false),
  );
});

describe('handleRecapCommand', () => {
  it('sends the formatted recap to the owner on demand', async () => {
    getDailyRecapMock.mockResolvedValue({
      date: 'Selasa, 9 Juni 2026',
      omzet: 100000,
      txnCount: 5,
      kasbonBaru: 0,
      lowStock: [],
    });
    const result = await handleRecapCommand({
      shop: { _id: 'shop-1' },
      message: { from: '+6281234567890' },
    });
    expect(getDailyRecapMock).toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith('+6281234567890', expect.stringMatching(/100\.000/u));
    expect(result.action).toBe('recap_now');
  });
});

describe('sendDailyRecap', () => {
  it('pushes the recap to the owner via notifyOwner', async () => {
    getDailyRecapMock.mockResolvedValue({
      date: 'Selasa, 9 Juni 2026',
      omzet: 0,
      txnCount: 0,
      kasbonBaru: 0,
      lowStock: [],
    });
    notifyOwnerMock.mockResolvedValue({ sent: true });
    const result = await sendDailyRecap({ _id: 'shop-1', ownerPhone: '+62812' }, {});
    expect(notifyOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'shop-1' }),
      expect.stringContaining('Rekap Hari Ini'),
    );
    expect(result.sent).toBe(true);
  });
});
