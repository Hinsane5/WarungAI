import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getGeminiClient, hasUsableGemini } from './extractor.js';

const SYSTEM_PROMPT = `Kamu "WarungAI", asisten WhatsApp untuk pemilik warung kelontong di Indonesia.
Jawab SINGKAT (maksimal 3-4 kalimat), ramah, dan dalam Bahasa Indonesia santai.
Kamu membantu soal: cara mencatat penjualan/stok, kasbon, loyalti, promo, dan tips mengelola warung.

PENTING: untuk angka spesifik milik warung ini (stok, omzet, untung, total kasbon), JANGAN mengarang.
Arahkan pemilik memakai perintah yang sesuai, contoh:
- "cek stok indomie" untuk cek stok
- "rekap sekarang" untuk ringkasan hari ini
- "rekap bulanan" untuk laporan bulan ini
- "untung hari ini" / "untung bulan ini" untuk laba bersih
- "barang apa yang perlu direstok" untuk daftar restok
- "kasbon budi 2 rokok 50000" untuk catat kasbon, "tagih budi" untuk menagih

Jika pertanyaan di luar topik warung, arahkan kembali dengan sopan.`;

// General warung Q&A fallback. Answers how-to / explanatory questions; for specific numbers it
// points the owner to the right command (it must never fabricate the warung's data).
export async function askWarungAssistant({ text }) {
  if (!hasUsableGemini()) {
    return null;
  }

  try {
    const response = await getGeminiClient().models.generateContent({
      model: config.gcp.geminiModel,
      contents: `${SYSTEM_PROMPT}\n\nPertanyaan pemilik warung:\n${text}\n\nJawaban:`,
    });
    return response.text?.trim() || null;
  } catch (error) {
    logger.warn({ err: error }, 'Warung assistant failed');
    return null;
  }
}
