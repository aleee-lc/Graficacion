import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { comparePassword, hashPassword } from '../utils/password';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type UserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  password: string;
  user_type: 'TECH' | 'CLIENT';
  created_at?: Date;
};

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, email, password } = parsed.data;

  const [existing] = await pool.query<UserRow[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const hashed = await hashPassword(password);
  await pool.query(
    'INSERT INTO users (name, email, password, user_type, created_at) VALUES (?, ?, ?, ?, ?)',
    [name, email, hashed, 'TECH', new Date()]
  );

  res.status(201).json({ message: 'User created' });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const user = rows[0];
  if (user.user_type !== 'TECH') {
    res.status(403).json({ message: 'Only technical users can access the platform' });
    return;
  }

  const match = await comparePassword(password, user.password);
  if (!match) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      userType: user.user_type
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.user_type
    }
  });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, name, email, user_type, created_at FROM users WHERE id = ?',
    [userId]
  );

  if (rows.length === 0) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const user = rows[0];

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.user_type,
      createdAt: user.created_at
    }
  });
});

export default router;
