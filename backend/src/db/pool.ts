import { Pool } from 'pg';
import { env } from '../config/env';

const ssl = env.DB_SSL ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool(
  env.DATABASE_URL
    ? {
        connectionString: env.DATABASE_URL,
        ssl
      }
    : {
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        max: 10,
        ssl
      }
);
