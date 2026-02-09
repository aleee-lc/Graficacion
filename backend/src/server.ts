import app from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${env.PORT}`);
});
