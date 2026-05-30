import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_BASE_URL: z.string().url(),

  MONGODB_URI: z.string().min(1),

  WHATSAPP_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_GRAPH_API_VERSION: z.string().min(1).default('v21.0'),

  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),
  GCP_PROJECT_ID: z.string().min(1),
  GCP_LOCATION: z.string().min(1).default('us-central1'),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),

  FREE_TIER_DAILY_TXN_CAP: z.coerce.number().int().positive().default(50),
  KOIN_BOT_ENABLED: booleanFromEnv.default(true),
  EXTRACTION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const messages = parsedEnv.error.issues.map((issue) => {
    const path = issue.path.join('.') || 'env';
    return `${path}: ${issue.message}`;
  });

  throw new Error(`Invalid environment configuration:\n${messages.join('\n')}`);
}

export const config = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  logLevel: parsedEnv.data.LOG_LEVEL,
  publicBaseUrl: parsedEnv.data.PUBLIC_BASE_URL,
  mongo: {
    uri: parsedEnv.data.MONGODB_URI,
  },
  whatsapp: {
    token: parsedEnv.data.WHATSAPP_TOKEN,
    phoneNumberId: parsedEnv.data.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: parsedEnv.data.WHATSAPP_VERIFY_TOKEN,
    appSecret: parsedEnv.data.WHATSAPP_APP_SECRET,
    graphApiVersion: parsedEnv.data.WHATSAPP_GRAPH_API_VERSION,
  },
  gcp: {
    credentialsPath: parsedEnv.data.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: parsedEnv.data.GCP_PROJECT_ID,
    location: parsedEnv.data.GCP_LOCATION,
    geminiModel: parsedEnv.data.GEMINI_MODEL,
  },
  limits: {
    freeTierDailyTxnCap: parsedEnv.data.FREE_TIER_DAILY_TXN_CAP,
    koinBotEnabled: parsedEnv.data.KOIN_BOT_ENABLED,
    extractionConfidenceThreshold: parsedEnv.data.EXTRACTION_CONFIDENCE_THRESHOLD,
    sessionTtlMinutes: parsedEnv.data.SESSION_TTL_MINUTES,
  },
};
