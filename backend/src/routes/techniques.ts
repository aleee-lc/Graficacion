import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const techniqueSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

type TechniqueRow = RowDataPacket & {
  id: number;
  name: string;
  description: string | null;
};

router.get('/', async (_req, res) => {
  const [rows] = await pool.query<TechniqueRow[]>(
    'SELECT id, name, description FROM techniques ORDER BY id DESC'
  );
  res.json({ techniques: rows });
});

router.post('/', async (req, res) => {
  const parsed = techniqueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO techniques (name, description) VALUES (?, ?)',
    [name, description ?? null]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;
