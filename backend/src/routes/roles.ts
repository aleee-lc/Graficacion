import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const roleSchema = z.object({
  name: z.string().min(1)
});

type RoleRow = RowDataPacket & {
  id: number;
  name: string;
};

router.get('/tech', async (_req, res) => {
  const [rows] = await pool.query<RoleRow[]>('SELECT id, name FROM tech_roles ORDER BY id DESC');
  res.json({ roles: rows });
});

router.post('/tech', async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO tech_roles (name) VALUES (?)',
    [parsed.data.name]
  );

  res.status(201).json({ id: result.insertId });
});

router.put('/tech/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid role id' });
    return;
  }

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE tech_roles SET name = ? WHERE id = ?',
    [parsed.data.name, id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Role not found' });
    return;
  }

  res.json({ message: 'Role updated' });
});

router.delete('/tech/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid role id' });
    return;
  }

  const [usageRows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM tech_user_roles WHERE role_id = ? LIMIT 1',
    [id]
  );
  if (usageRows.length > 0) {
    res.status(409).json({ message: 'Role is in use by tech users' });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM tech_roles WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Role not found' });
    return;
  }

  res.json({ message: 'Role deleted' });
});

router.get('/stakeholders', async (_req, res) => {
  const [rows] = await pool.query<RoleRow[]>('SELECT id, name FROM stakeholder_roles ORDER BY id DESC');
  res.json({ roles: rows });
});

router.post('/stakeholders', async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO stakeholder_roles (name) VALUES (?)',
    [parsed.data.name]
  );

  res.status(201).json({ id: result.insertId });
});

router.put('/stakeholders/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid role id' });
    return;
  }

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE stakeholder_roles SET name = ? WHERE id = ?',
    [parsed.data.name, id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Role not found' });
    return;
  }

  res.json({ message: 'Role updated' });
});

router.delete('/stakeholders/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid role id' });
    return;
  }

  const [usageRows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM stakeholder_profile WHERE stakeholder_role_id = ? LIMIT 1',
    [id]
  );
  if (usageRows.length > 0) {
    res.status(409).json({ message: 'Role is in use by stakeholders' });
    return;
  }

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM stakeholder_roles WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Role not found' });
    return;
  }

  res.json({ message: 'Role deleted' });
});

export default router;
