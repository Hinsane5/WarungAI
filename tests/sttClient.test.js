import { afterEach, describe, expect, it, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const speechClientMock = vi.hoisted(() =>
  vi.fn(function SpeechClient() {
    return { recognize: recognizeMock };
  }),
);

vi.mock('@google-cloud/speech', () => ({
  default: {
    SpeechClient: speechClientMock,
  },
}));

const { transcribeOggOpus } = await import('../src/ai/sttClient.js');

describe('sttClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('transcribes OGG/Opus Indonesian audio and averages confidence', async () => {
    recognizeMock.mockResolvedValueOnce([
      {
        results: [
          { alternatives: [{ transcript: 'laku 2 indomie', confidence: 0.8 }] },
          { alternatives: [{ transcript: 'masuk 1 aqua', confidence: 0.6 }] },
        ],
      },
    ]);

    const result = await transcribeOggOpus(Buffer.from('audio-bytes'));

    expect(speechClientMock).toHaveBeenCalledTimes(1);
    expect(recognizeMock).toHaveBeenCalledWith({
      config: {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'id-ID',
        enableAutomaticPunctuation: true,
      },
      audio: { content: Buffer.from('audio-bytes').toString('base64') },
    });
    expect(result).toEqual({
      transcript: 'laku 2 indomie masuk 1 aqua',
      confidence: 0.7,
    });
  });

  it('returns an empty transcript with zero confidence when STT has no alternatives', async () => {
    recognizeMock.mockResolvedValueOnce([{ results: [] }]);

    await expect(transcribeOggOpus(Buffer.from('audio-bytes'))).resolves.toEqual({
      transcript: '',
      confidence: 0,
    });
  });
});
