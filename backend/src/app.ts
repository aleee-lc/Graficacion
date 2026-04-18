import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import projectFeatureRouter from './modules/projects/project.routes';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import projectsRouter from './routes/projects';
import processesRouter from './routes/processes';
import rolesRouter from './routes/roles';
import subprocessesRouter from './routes/subprocesses';
import techniquesRouter from './routes/techniques';
import usersRouter from './routes/users';

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
app.use('/projects', projectFeatureRouter);
app.use('/projects', projectsRouter);
app.use('/processes', processesRouter);
app.use('/roles', rolesRouter);
app.use('/subprocesses', subprocessesRouter);
app.use('/techniques', techniquesRouter);
app.use('/users', usersRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use(errorHandler);

export default app;
