import { Router } from 'express';
import { z } from 'zod';
import { getTechniqueStatusIdByCode } from '../db/catalogs';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const subprocessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type SubprocessRow = {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

type TechniqueRow = {
  id: number;
  name: string;
  description: string | null;
};

type SubprocessTechniqueRow = {
  id: number;
  subprocess_id: number;
  technique_id: number;
  tech_user_id: number | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: string;
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
  const rows = await pool.query(
    `SELECT 1
     FROM subprocesses sp
     INNER JOIN processes p ON p.id = sp.process_id
     INNER JOIN project_users pu ON pu.project_id = p.project_id
     WHERE sp.id = $1 AND pu.user_id = $2
     LIMIT 1`,
    [subprocessId, userId]
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
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const rows = await pool.query<SubprocessRow>(
    'SELECT id, process_id, name, description FROM subprocesses WHERE id = $1',
    [id]
  );

  if (rows.rows.length === 0) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  res.json({ subprocess: rows.rows[0] });
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

  const result = await pool.query('UPDATE subprocesses SET name = $1, description = $2 WHERE id = $3', [
    name,
    description ?? null,
    id
  ]);

  if (result.rowCount === 0) {
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

  const rows = await pool.query<SubprocessTechniqueRow>(
    `SELECT st.id,
            st.subprocess_id,
            st.technique_id,
            st.tech_user_id,
            st.scheduled_date::text,
            st.duration_minutes,
            ts.code AS status,
            t.name,
            t.description
     FROM subprocess_techniques st
     INNER JOIN techniques t ON t.id = st.technique_id
     INNER JOIN technique_statuses ts ON ts.id = st.status
     WHERE st.subprocess_id = $1
     ORDER BY st.id DESC`,
    [id]
  );

  res.json({
    techniques: rows.rows.map((row: SubprocessTechniqueRow) => ({
      ...row,
      status: row.status.toUpperCase() as 'PLANNED' | 'DONE' | 'CANCELLED'
    }))
  });
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

  const techniqueRows = await pool.query<TechniqueRow>('SELECT id FROM techniques WHERE id = $1', [technique_id]);
  if (techniqueRows.rows.length === 0) {
    res.status(404).json({ message: 'Technique not found' });
    return;
  }

  const existingRows = await pool.query(
    'SELECT id FROM subprocess_techniques WHERE subprocess_id = $1 AND technique_id = $2 LIMIT 1',
    [id, technique_id]
  );
  if (existingRows.rows.length > 0) {
    res.status(409).json({ message: 'Technique already assigned to subprocess' });
    return;
  }

  const plannedStatusId = await getTechniqueStatusIdByCode('PLANNED');
  if (!plannedStatusId) {
    res.status(500).json({ message: 'Catalog technique_statuses missing PLANNED code' });
    return;
  }

  const result = await pool.query<{ id: number }>(
    `INSERT INTO subprocess_techniques
     (subprocess_id, technique_id, tech_user_id, scheduled_date, duration_minutes, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [id, technique_id, tech_user_id ?? null, scheduled_date ?? null, duration_minutes ?? null, plannedStatusId]
  );

  res.status(201).json({ id: result.rows[0].id });
});

export default router;
