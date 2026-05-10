import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('postgres'),
  DB_SSL: z.string().default('false'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  EVIDENCE_MAX_SIZE_MB: z.string().default('25'),
  EVIDENCE_ALLOWED_MIME: z.string().optional(),
  EVIDENCE_SIGNED_URL_TTL_SECONDS: z.string().default('600'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const parsedEvidenceMaxSizeMb = Number(parsed.data.EVIDENCE_MAX_SIZE_MB);
const parsedEvidenceTtlSeconds = Number(parsed.data.EVIDENCE_SIGNED_URL_TTL_SECONDS);

export const env = {
  PORT: Number(parsed.data.PORT),
  DATABASE_URL: parsed.data.DATABASE_URL,
  DB_HOST: parsed.data.DB_HOST,
  DB_PORT: Number(parsed.data.DB_PORT),
  DB_USER: parsed.data.DB_USER,
  DB_PASSWORD: parsed.data.DB_PASSWORD,
  DB_NAME: parsed.data.DB_NAME,
  DB_SSL: parsed.data.DB_SSL.toLowerCase() === 'true',
  JWT_SECRET: parsed.data.JWT_SECRET,
  JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
  CORS_ORIGIN: parsed.data.CORS_ORIGIN,
  SUPABASE_URL: parsed.data.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET: parsed.data.SUPABASE_STORAGE_BUCKET,
  EVIDENCE_MAX_SIZE_MB:
    Number.isFinite(parsedEvidenceMaxSizeMb) && parsedEvidenceMaxSizeMb > 0 ? parsedEvidenceMaxSizeMb : 25,
  EVIDENCE_ALLOWED_MIME: (parsed.data.EVIDENCE_ALLOWED_MIME ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  EVIDENCE_SIGNED_URL_TTL_SECONDS:
    Number.isFinite(parsedEvidenceTtlSeconds) && parsedEvidenceTtlSeconds >= 60
      ? Math.floor(parsedEvidenceTtlSeconds)
      : 600,
  OPENROUTER_API_KEY: parsed.data.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: parsed.data.OPENROUTER_MODEL,
  OPENROUTER_BASE_URL: parsed.data.OPENROUTER_BASE_URL
};
