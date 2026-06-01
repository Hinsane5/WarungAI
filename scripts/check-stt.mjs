// Verify GCP Speech-to-Text is set up correctly: credentials + API enabled + billing.
// Run AFTER you authenticate with ADC (`gcloud auth application-default login`) or
// set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path.
// Also set a real GCP_PROJECT_ID in .env.
//
// Usage:  node scripts/check-stt.mjs
//
// It transcribes a public Google sample clip, so a success proves the full chain
// (auth → API enabled → billing active) without you needing your own audio file.
import 'dotenv/config';
import speech from '@google-cloud/speech';

const client = new speech.SpeechClient();

try {
  const [response] = await client.recognize({
    config: { encoding: 'FLAC', languageCode: 'en-US' },
    audio: { uri: 'gs://cloud-samples-data/speech/brooklyn_bridge.flac' },
  });

  const transcript =
    response.results
      ?.map((r) => r.alternatives?.[0]?.transcript ?? '')
      .join(' ')
      .trim() || '(empty)';

  console.log('✓ Speech-to-Text is working.');
  console.log(`  Sample transcript: "${transcript}"`);
} catch (error) {
  console.error('✗ Speech-to-Text check FAILED:', error.message);
  console.error('  Common causes:');
  console.error('   - Cloud Speech-to-Text API not enabled on the project');
  console.error('   - Billing not linked to the project');
  console.error(
    '   - ADC not configured, or GOOGLE_APPLICATION_CREDENTIALS points to a bad key file',
  );
  console.error('   - GCP_PROJECT_ID still "replace-me"');
  process.exitCode = 1;
} finally {
  await client.close();
}
