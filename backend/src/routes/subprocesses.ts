import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const subprocessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type SubprocessRow = RowDataPacket & {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

type TechniqueRow = RowDataPacket & {
  id: number;
  name: string;
  description: string | null;
};

type SubprocessTechniqueRow = RowDataPacket & {
  id: number;
  subprocess_id: number;
  technique_id: number;
  tech_user_id: number | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  name: string;
  description: string | null;
};

const assignTechniqueSchema = z.object({
  technique_id: z.number().int().positive(),
  tech_user_id: z.number().int().positive().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  duration_minutes: z.number().int().positive().optional().nullable()
});

const hasSubprocessAccess = async (subprocessId: number, userId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
     FROM subprocesses sp
     INNER JOIN processes p ON p.id = sp.process_id
     INNER JOIN project_users pu ON pu.project_id = p.project_id
     WHERE sp.id = ? AND pu.user_id = ?
     LIMIT 1`,
    [subprocessId, userId]
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
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const [rows] = await pool.query<SubprocessRow[]>(
    'SELECT id, process_id, name, description FROM subprocesses WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  res.json({ subprocess: rows[0] });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const parsed = subprocessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE subprocesses SET name = ?, description = ? WHERE id = ?',
    [name, description ?? null, id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  res.json({ message: 'Subprocess updated' });
});

router.get('/:id/techniques', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const [rows] = await pool.query<SubprocessTechniqueRow[]>(
    `SELECT st.id, st.subprocess_id, st.technique_id, st.tech_user_id,
            st.scheduled_date, st.duration_minutes, st.status,
            t.name, t.description
     FROM subprocess_techniques st
     INNER JOIN techniques t ON t.id = st.technique_id
     WHERE st.subprocess_id = ?
     ORDER BY st.id DESC`,
    [id]
  );

  res.json({ techniques: rows });
});

router.post('/:id/techniques', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const parsed = assignTechniqueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { technique_id, tech_user_id, scheduled_date, duration_minutes } = parsed.data;

  const [techniqueRows] = await pool.query<TechniqueRow[]>(
    'SELECT id FROM techniques WHERE id = ?',
    [technique_id]
  );
  if (techniqueRows.length === 0) {
    res.status(404).json({ message: 'Technique not found' });
    return;
  }

  const [existingRows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM subprocess_techniques WHERE subprocess_id = ? AND technique_id = ? LIMIT 1',
    [id, technique_id]
  );
  if (existingRows.length > 0) {
    res.status(409).json({ message: 'Technique already assigned to subprocess' });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO subprocess_techniques
     (subprocess_id, technique_id, tech_user_id, scheduled_date, duration_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      technique_id,
      tech_user_id ?? null,
      scheduled_date ?? null,
      duration_minutes ?? null,
      'PLANNED'
    ]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;
