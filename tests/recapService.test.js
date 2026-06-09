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
  it('renders the recap line with rupiah and low-stock names', () => {
    const text = formatDailyRecap({
      omzet: 487000,
      txnCount: 38,
      kasbonBaru: 50000,
      lowStock: ['Indomie', 'Aqua'],
    });
    expect(text).toMatch(/^Hari ini: omzet Rp.?487\.000, 38 transaksi, kasbon baru Rp.?50\.000/u);
    expect(text).toContain('stok menipis: Indomie, Aqua');
  });

  it("says 'tidak ada' when nothing is low on stock", () => {
    expect(formatDailyRecap({ omzet: 0, txnCount: 0, kasbonBaru: 0, lowStock: [] })).toContain(
      'stok menipis: tidak ada',
    );
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
    getDailyRecapMock.mockResolvedValue({ omzet: 100000, txnCount: 5, kasbonBaru: 0, lowStock: [] });
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
    getDailyRecapMock.mockResolvedValue({ omzet: 0, txnCount: 0, kasbonBaru: 0, lowStock: [] });
    notifyOwnerMock.mockResolvedValue({ sent: true });
    const result = await sendDailyRecap({ _id: 'shop-1', ownerPhone: '+62812' }, {});
    expect(notifyOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'shop-1' }),
      expect.stringContaining('Hari ini:'),
    );
    expect(result.sent).toBe(true);
  });
});
