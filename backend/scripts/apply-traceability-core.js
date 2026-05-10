const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const migrationsDir = path.resolve(__dirname, '..', '..', 'database', 'migrations');

const readTraceabilityMigrations = () => {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && file.includes('traceability'))
    .sort()
    .map((file) => ({
      name: file,
      sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    }));
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const migrations = readTraceabilityMigrations();
  if (migrations.length === 0) {
    throw new Error('No traceability migrations found.');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    for (const migration of migrations) {
      // eslint-disable-next-line no-console
      console.log(`Applying migration: ${migration.name}`);
      await client.query(migration.sql);
    }
    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log('Traceability migrations applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to apply traceability migrations:', error.message);
  process.exit(1);
});
