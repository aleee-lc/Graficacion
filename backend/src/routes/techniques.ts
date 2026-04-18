import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const techniqueSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type TechniqueRow = {
  id: number;
  name: string;
  description: string | null;
};

router.get('/', async (_req, res) => {
  const rows = await pool.query<TechniqueRow>(
    'SELECT id, name, description FROM techniques ORDER BY id DESC'
  );
  res.json({ techniques: rows.rows });
});

router.post('/', async (req, res) => {
  const parsed = techniqueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;
  const result = await pool.query<TechniqueRow>(
    'INSERT INTO techniques (name, description) VALUES ($1, $2) RETURNING id',
    [name, description ?? null]
  );

  res.status(201).json({ id: result.rows[0].id });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid technique id' });
    return;
  }

  const parsed = techniqueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;
  const result = await pool.query('UPDATE techniques SET name = $1, description = $2 WHERE id = $3', [
    name,
    description ?? null,
    id
  ]);

  if (result.rowCount === 0) {
    res.status(404).json({ message: 'Technique not found' });
    return;
  }

  res.json({ message: 'Technique updated' });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid technique id' });
    return;
  }

  try {
    const result = await pool.query('DELETE FROM techniques WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Technique not found' });
      return;
    }

    res.json({ message: 'Technique deleted' });
  } catch (error) {
    const dbCode = (error as { code?: string }).code;
    if (dbCode === '23503') {
      res.status(409).json({ message: 'Technique is in use by subprocesses' });
      return;
    }
    throw error;
  }
});

export default router;
