import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import authRouter from './routes/auth';
import healthRouter from './routes/health';

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

export default app;
