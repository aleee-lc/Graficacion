import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// DEPRECATED (traceability refactor):
// These process/subprocess routes are kept for backward compatibility only.
// New core flow should use project -> sessions -> findings -> requirements -> traceability.
router.use((req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'Warning',
    '299 - "Deprecated endpoint. Migrate to /projects/:id/sessions and traceability flow endpoints."'
  );
  // eslint-disable-next-line no-console
  console.warn(`[DEPRECATED] ${req.method} ${req.originalUrl}`);
  next();
});

const processSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

const subprocessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type ProcessRow = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
};

type SubprocessRow = {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

const hasProcessAccess = async (processId: number, userId: number) => {
  const rows = await pool.query(
    `SELECT 1
     FROM processes p
     INNER JOIN project_users pu ON pu.project_id = p.project_id
     WHERE p.id = $1 AND pu.user_id = $2
     LIMIT 1`,
    [processId, userId]
  );
  return rows.rows.length > 0;
};

router.get('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid process id' });
    return;
  }

  const hasAccess = await hasProcessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  const rows = await pool.query<ProcessRow>(
    'SELECT id, project_id, name, description FROM processes WHERE id = $1',
    [id]
  );

  if (rows.rows.length === 0) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  res.json({ process: rows.rows[0] });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid process id' });
    return;
  }

  const hasAccess = await hasProcessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  const parsed = processSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;

  const result = await pool.query('UPDATE processes SET name = $1, description = $2 WHERE id = $3', [
    name,
    description ?? null,
    id
  ]);

  if (result.rowCount === 0) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  res.json({ message: 'Process updated' });
});

router.get('/:id/subprocesses', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const processId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(processId)) {
    res.status(400).json({ message: 'Invalid process id' });
    return;
  }

  const hasAccess = await hasProcessAccess(processId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  const rows = await pool.query<SubprocessRow>(
    'SELECT id, process_id, name, description FROM subprocesses WHERE process_id = $1 ORDER BY id DESC',
    [processId]
  );

  res.json({ subprocesses: rows.rows });
});

router.post('/:id/subprocesses', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const processId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(processId)) {
    res.status(400).json({ message: 'Invalid process id' });
    return;
  }

  const hasAccess = await hasProcessAccess(processId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  const parsed = subprocessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;

  const result = await pool.query<SubprocessRow>(
    'INSERT INTO subprocesses (process_id, name, description) VALUES ($1, $2, $3) RETURNING id',
    [processId, name, description ?? null]
  );

  res.status(201).json({ id: result.rows[0].id });
});

export default router;
