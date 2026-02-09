import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { hashPassword } from '../utils/password';

const router = Router();
router.use(requireAuth);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().min(7),
  user_type: z.enum(['TECH', 'CLIENT']),
  password: z.string().min(8).optional(),
  company: z.string().min(2).optional(),
  role: z.string().min(2).optional(),
  techRoleIds: z.array(z.number().int().positive()).optional(),
  stakeholder_role_id: z.number().int().positive().optional()
});

type UserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: 'TECH' | 'CLIENT';
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
  techRoles?: RoleRow[];
};

type RoleRow = RowDataPacket & {
  id: number;
  name: string;
};

type TechUserRoleRow = RowDataPacket & {
  userId: number;
  id: number;
  name: string;
};

router.get('/', async (req, res) => {
  const type = String(req.query.type || '').toUpperCase();
  const query = String(req.query.query || '').trim();

  if (type !== 'TECH' && type !== 'CLIENT') {
    res.status(400).json({ message: 'Invalid user type' });
    return;
  }

  const like = `%${query}%`;
  const params: (string | number)[] = [type];
  let whereQuery = '';

  if (query.length > 0) {
    whereQuery = 'AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(like, like);
  }

  const [rows] = await pool.query<UserRow[]>(
    `SELECT u.id, u.name, u.email, u.mobile, u.user_type as userType,
            sp.company_name as companyName, sr.name as roleName,
            sp.stakeholder_role_id as stakeholderRoleId
     FROM users u
     LEFT JOIN stakeholder_profile sp ON sp.user_id = u.id
     LEFT JOIN stakeholder_roles sr ON sp.stakeholder_role_id = sr.id
     WHERE u.user_type = ? ${whereQuery}
     ORDER BY u.id DESC
     LIMIT 20`,
    params
  );

  if (type === 'TECH' && rows.length > 0) {
    const userIds = rows.map((row) => row.id);
    const [roleRows] = await pool.query<TechUserRoleRow[]>(
      `SELECT tur.user_id as userId, tr.id, tr.name
       FROM tech_user_roles tur
       INNER JOIN tech_roles tr ON tr.id = tur.role_id
       WHERE tur.user_id IN (?)`,
      [userIds]
    );

    const roleMap = new Map<number, RoleRow[]>();
    roleRows.forEach((row) => {
      if (!roleMap.has(row.userId)) {
        roleMap.set(row.userId, []);
      }
      roleMap.get(row.userId)!.push({ id: row.id, name: row.name });
    });

    rows.forEach((row) => {
      row.techRoles = roleMap.get(row.id) ?? [];
    });
  }

  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const {
    name,
    email,
    mobile,
    user_type,
    password,
    company,
    role,
    techRoleIds,
    stakeholder_role_id
  } = parsed.data;

  const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  if (user_type === 'TECH' && !password) {
    res.status(400).json({ message: 'Password is required for TECH users' });
    return;
  }

  const normalizedTechRoleIds = techRoleIds ? Array.from(new Set(techRoleIds)) : [];

  if (user_type === 'TECH' && normalizedTechRoleIds.length === 0) {
    res.status(400).json({ message: 'Selecciona al menos un rol tecnico.' });
    return;
  }

  if (user_type === 'CLIENT' && !company) {
    res.status(400).json({ message: 'Company is required for CLIENT users' });
    return;
  }

  if (user_type === 'CLIENT' && !stakeholder_role_id && !role) {
    res.status(400).json({ message: 'Selecciona un rol de stakeholder.' });
    return;
  }

  if (user_type === 'TECH' && normalizedTechRoleIds.length > 0) {
    const [roleRows] = await pool.query<RoleRow[]>(
      'SELECT id FROM tech_roles WHERE id IN (?)',
      [normalizedTechRoleIds]
    );
    if (roleRows.length !== normalizedTechRoleIds.length) {
      res.status(400).json({ message: 'Algunos roles técnicos no existen.' });
      return;
    }
  }

  let resolvedStakeholderRoleId: number | null = stakeholder_role_id ?? null;
  if (user_type === 'CLIENT' && resolvedStakeholderRoleId) {
    const [stakeholderRows] = await pool.query<RoleRow[]>(
      'SELECT id FROM stakeholder_roles WHERE id = ?',
      [resolvedStakeholderRoleId]
    );
    if (stakeholderRows.length === 0) {
      res.status(400).json({ message: 'El rol del stakeholder no existe.' });
      return;
    }
  }

  let hashed: string | null = null;
  if (user_type === 'TECH' && password) {
    hashed = await hashPassword(password);
  }

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO users (name, email, password, user_type, created_at, mobile) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, hashed, user_type, new Date(), mobile]
  );
  const userId = result.insertId;

  if (user_type === 'TECH' && normalizedTechRoleIds.length > 0) {
    const values = normalizedTechRoleIds.map((roleId) => [userId, roleId]);
    await pool.query('INSERT INTO tech_user_roles (user_id, role_id) VALUES ?', [values]);
  }

  if (user_type === 'CLIENT') {
    if (!resolvedStakeholderRoleId && role) {
      const [roleRows] = await pool.query<RoleRow[]>('SELECT id FROM stakeholder_roles WHERE name = ?', [role]);
      if (roleRows.length > 0) {
        resolvedStakeholderRoleId = roleRows[0].id;
      } else {
        const [roleResult] = await pool.query<ResultSetHeader>(
          'INSERT INTO stakeholder_roles (name) VALUES (?)',
          [role]
        );
        resolvedStakeholderRoleId = roleResult.insertId;
      }
    }

    if (company || resolvedStakeholderRoleId) {
      await pool.query(
        'INSERT INTO stakeholder_profile (user_id, stakeholder_role_id, company_name) VALUES (?, ?, ?)',
        [userId, resolvedStakeholderRoleId, company ?? null]
      );
    }
  }

  res.status(201).json({ id: userId });
});

export default router;
