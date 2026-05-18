import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import projectFeatureRouter from './modules/projects/project.routes';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import projectAiRouter from './routes/project-ai';
import projectsRouter from './routes/projects';
import processesRouter from './routes/processes';
import rolesRouter from './routes/roles';
import sessionsRouter from './routes/sessions';
import subprocessesRouter from './routes/subprocesses';
import surveysRouter from './routes/surveys';
import techniqueDefinitionsRouter from './routes/technique-definitions';
import techniquesRouter from './routes/techniques';
import usersRouter from './routes/users';

const app = express();
const configuredCorsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedLocalOrigin = (origin: string) =>
  /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configuredCorsOrigins.includes(origin) || isAllowedLocalOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/projects', projectFeatureRouter);
app.use('/projects', projectAiRouter);
app.use('/projects', projectsRouter);
app.use('/processes', processesRouter);
app.use('/roles', rolesRouter);
app.use('/sessions', sessionsRouter);
app.use('/subprocesses', subprocessesRouter);
app.use('/surveys', surveysRouter);
app.use('/questionnaires', surveysRouter);
app.use('/technique-definitions', techniqueDefinitionsRouter);
app.use('/techniques', techniquesRouter);
app.use('/users', usersRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use(errorHandler);

export default app;
