import { Router } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { getUserTypeIdByCode } from '../db/catalogs';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { comparePassword, hashPassword } from '../utils/password';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  mobile: z.string().min(7)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type UserRow = {
  id: number;
  name: string;
  email: string;
  password: string | null;
  user_type_id: number;
  user_type_code: string;
  created_at: string | null;
};

const resolveTechUserTypeId = async () => getUserTypeIdByCode('TECH');

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, email, password } = parsed.data;

  const existing = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const techTypeId = await resolveTechUserTypeId();
  if (!techTypeId) {
    res.status(500).json({ message: 'Catalog user_types missing TECH code' });
    return;
  }

  const hashed = await hashPassword(password);
  await pool.query(
    'INSERT INTO users (name, email, password, user_type, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [name, email, hashed, techTypeId]
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

  const result = await pool.query<UserRow>(
    `SELECT u.id,
            u.name,
            u.email,
            u.password,
            u.user_type AS user_type_id,
            ut.code AS user_type_code,
            u.created_at::text AS created_at
     FROM users u
     INNER JOIN user_types ut ON ut.id = u.user_type
     WHERE u.email = $1
     LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const user = result.rows[0];
  if (user.user_type_code.toUpperCase() !== 'TECH') {
    res.status(403).json({ message: 'Only technical users can access the platform' });
    return;
  }
  if (!user.password) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const match = await comparePassword(password, user.password);
  if (!match) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const userType = user.user_type_code.toUpperCase() as 'TECH' | 'CLIENT';
  const signOptions: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  };

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      userType
    },
    env.JWT_SECRET,
    signOptions
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      userType,
      mobile: null
    }
  });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const result = await pool.query<UserRow>(
    `SELECT u.id,
            u.name,
            u.email,
            u.password,
            u.user_type AS user_type_id,
            ut.code AS user_type_code,
            u.created_at::text AS created_at
     FROM users u
     INNER JOIN user_types ut ON ut.id = u.user_type
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const user = result.rows[0];

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.user_type_code.toUpperCase(),
      mobile: null,
      createdAt: user.created_at
    }
  });
});

export default router;
