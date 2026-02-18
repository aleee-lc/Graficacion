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

export default router;
