import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const processSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

const subprocessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type ProcessRow = RowDataPacket & {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
};

type SubprocessRow = RowDataPacket & {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

const hasProcessAccess = async (processId: number, userId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
     FROM processes p
     INNER JOIN project_users pu ON pu.project_id = p.project_id
     WHERE p.id = ? AND pu.user_id = ?
     LIMIT 1`,
    [processId, userId]
  );
  return rows.length > 0;
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

  const [rows] = await pool.query<ProcessRow[]>(
    'SELECT id, project_id, name, description FROM processes WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    res.status(404).json({ message: 'Process not found' });
    return;
  }

  res.json({ process: rows[0] });
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

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE processes SET name = ?, description = ? WHERE id = ?',
    [name, description ?? null, id]
  );

  if (result.affectedRows === 0) {
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

  const [rows] = await pool.query<SubprocessRow[]>(
    'SELECT id, process_id, name, description FROM subprocesses WHERE process_id = ? ORDER BY id DESC',
    [processId]
  );

  res.json({ subprocesses: rows });
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

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO subprocesses (process_id, name, description) VALUES (?, ?, ?)',
    [processId, name, description ?? null]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;
