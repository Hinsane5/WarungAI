import speech from '@google-cloud/speech';

let speechClient;

function getSpeechClient() {
  speechClient ??= new speech.SpeechClient();
  return speechClient;
}

export async function transcribeOggOpus(audioBuffer) {
  const [response] = await getSpeechClient().recognize({
    config: {
      encoding: 'OGG_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'id-ID',
      enableAutomaticPunctuation: true,
    },
    audio: {
      content: audioBuffer.toString('base64'),
    },
  });

  const alternatives = (response.results ?? [])
    .map((result) => result.alternatives?.[0])
    .filter(Boolean);

  const transcript = alternatives
    .map((alternative) => alternative.transcript)
    .join(' ')
    .trim();
  const confidence =
    alternatives.length > 0
      ? alternatives.reduce((sum, alternative) => sum + (alternative.confidence ?? 0), 0) /
        alternatives.length
      : 0;

  return { transcript, confidence };
}
