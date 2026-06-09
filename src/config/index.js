import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PUBLIC_BASE_URL: z.string().url(),

    MONGODB_URI: z.string().min(1),

    WHATSAPP_PROVIDER: z.enum(['cloud', 'n8n']).default('cloud'),
    WHATSAPP_TOKEN: z.string().min(1),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1),
    WHATSAPP_APP_SECRET: z.string().min(1),
    WHATSAPP_GRAPH_API_VERSION: z.string().min(1).default('v21.0'),
    // The bot's dialable WhatsApp number (digits, e.g. 6281234567890) used to build the
    // customer-registration wa.me link/QR. Empty until a real bot is connected.
    WHATSAPP_BOT_NUMBER: z.string().default(''),

    N8N_OUTBOUND_URL: z.string().default(''),
    N8N_OUTBOUND_SECRET: z.string().default(''),
    N8N_INBOUND_SECRET: z.string().default(''),
    N8N_SEND_DELAY_MS: z.coerce.number().int().nonnegative().default(0),

    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
    GCP_PROJECT_ID: z.string().min(1),
    GCP_LOCATION: z.string().min(1).default('us-central1'),
    GEMINI_API_KEY: z.string().min(1),
    GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    // When true, call Gemini through Vertex AI (ADC auth, GCP_PROJECT_ID + GCP_LOCATION)
    // instead of the AI Studio API key.
    GEMINI_USE_VERTEX: booleanFromEnv.default(false),
    // GCP Natural Language API enrichment (customer-name + number entities).
    NL_API_ENABLED: booleanFromEnv.default(false),

    FREE_TIER_DAILY_TXN_CAP: z.coerce.number().int().positive().default(50),
    KOIN_BOT_ENABLED: booleanFromEnv.default(true),
    EXTRACTION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
    SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    // How long an in-flight multi-step flow (awaiting a reply) stays "live" before it's
    // treated as abandoned — shorter than the overall session TTL.
    PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    STT_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
    KASBON_DEFAULT_DUE_DAYS: z.coerce.number().int().positive().default(14),
    KASBON_WATCH_RISK_THRESHOLD: z.coerce.number().int().nonnegative().default(1),
    KASBON_RISKY_RISK_THRESHOLD: z.coerce.number().int().nonnegative().default(1_000_000),

    SALES_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
    RESTOCK_LEAD_TIME_DAYS: z.coerce.number().int().positive().default(3),
    EXPIRY_WARN_DAYS: z.coerce.number().int().positive().default(7),
    CRM_JOBS_ENABLED: booleanFromEnv.default(true),
    CRM_NIGHTLY_CRON: z.string().min(1).default('0 1 * * *'),
    CRM_TIMEZONE: z.string().min(1).default('Asia/Jakarta'),
    JOBS_TRIGGER_SECRET: z.string().default(''),

    BIGQUERY_ENABLED: booleanFromEnv.default(false),
    BIGQUERY_DATASET: z.string().min(1).default('warungai'),
    BIGQUERY_TABLE: z.string().min(1).default('transaction_items'),
    BIGQUERY_LOCATION: z.string().min(1).default('asia-southeast2'),
  })
  .superRefine((data, ctx) => {
    if (data.WHATSAPP_PROVIDER !== 'n8n') {
      return;
    }

    for (const key of ['N8N_OUTBOUND_URL', 'N8N_OUTBOUND_SECRET', 'N8N_INBOUND_SECRET']) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when WHATSAPP_PROVIDER=n8n`,
        });
      }
    }
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
    provider: parsedEnv.data.WHATSAPP_PROVIDER,
    token: parsedEnv.data.WHATSAPP_TOKEN,
    phoneNumberId: parsedEnv.data.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: parsedEnv.data.WHATSAPP_VERIFY_TOKEN,
    appSecret: parsedEnv.data.WHATSAPP_APP_SECRET,
    graphApiVersion: parsedEnv.data.WHATSAPP_GRAPH_API_VERSION,
    botNumber: parsedEnv.data.WHATSAPP_BOT_NUMBER,
  },
  n8n: {
    outboundUrl: parsedEnv.data.N8N_OUTBOUND_URL,
    outboundSecret: parsedEnv.data.N8N_OUTBOUND_SECRET,
    inboundSecret: parsedEnv.data.N8N_INBOUND_SECRET,
    sendDelayMs: parsedEnv.data.N8N_SEND_DELAY_MS,
  },
  gcp: {
    credentialsPath: parsedEnv.data.GOOGLE_APPLICATION_CREDENTIALS || null,
    projectId: parsedEnv.data.GCP_PROJECT_ID,
    location: parsedEnv.data.GCP_LOCATION,
    geminiApiKey: parsedEnv.data.GEMINI_API_KEY,
    geminiModel: parsedEnv.data.GEMINI_MODEL,
    useVertex: parsedEnv.data.GEMINI_USE_VERTEX,
    nlApiEnabled: parsedEnv.data.NL_API_ENABLED,
  },
  limits: {
    freeTierDailyTxnCap: parsedEnv.data.FREE_TIER_DAILY_TXN_CAP,
    koinBotEnabled: parsedEnv.data.KOIN_BOT_ENABLED,
    extractionConfidenceThreshold: parsedEnv.data.EXTRACTION_CONFIDENCE_THRESHOLD,
    sessionTtlMinutes: parsedEnv.data.SESSION_TTL_MINUTES,
    pendingTtlMinutes: parsedEnv.data.PENDING_TTL_MINUTES,
    sttLowConfidenceThreshold: parsedEnv.data.STT_LOW_CONFIDENCE_THRESHOLD,
    kasbonDefaultDueDays: parsedEnv.data.KASBON_DEFAULT_DUE_DAYS,
    kasbonWatchRiskThreshold: parsedEnv.data.KASBON_WATCH_RISK_THRESHOLD,
    kasbonRiskyRiskThreshold: parsedEnv.data.KASBON_RISKY_RISK_THRESHOLD,
    salesWindowDays: parsedEnv.data.SALES_WINDOW_DAYS,
    restockLeadTimeDays: parsedEnv.data.RESTOCK_LEAD_TIME_DAYS,
    expiryWarnDays: parsedEnv.data.EXPIRY_WARN_DAYS,
  },
  jobs: {
    enabled: parsedEnv.data.CRM_JOBS_ENABLED,
    nightlyCron: parsedEnv.data.CRM_NIGHTLY_CRON,
    timezone: parsedEnv.data.CRM_TIMEZONE,
    triggerSecret: parsedEnv.data.JOBS_TRIGGER_SECRET,
  },
  bigquery: {
    enabled: parsedEnv.data.BIGQUERY_ENABLED,
    projectId: parsedEnv.data.GCP_PROJECT_ID,
    datasetId: parsedEnv.data.BIGQUERY_DATASET,
    tableId: parsedEnv.data.BIGQUERY_TABLE,
    location: parsedEnv.data.BIGQUERY_LOCATION,
  },
};
