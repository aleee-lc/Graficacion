import app from './app';
import { env } from './config/env';
import { ensureDefaultTechniques } from './db/default-techniques';

const start = async () => {
  const insertedDefaults = await ensureDefaultTechniques();
  if (insertedDefaults > 0) {
    // eslint-disable-next-line no-console
    console.log(`Seeded ${insertedDefaults} default techniques`);
  }

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend running on http://localhost:${env.PORT}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend', error);
  process.exit(1);
});

