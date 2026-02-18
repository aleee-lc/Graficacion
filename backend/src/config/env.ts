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
  CORS_ORIGIN: z.string().default('http://localhost:4200')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

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
  CORS_ORIGIN: parsed.data.CORS_ORIGIN
};
