import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { hashPassword } from '../utils/password';

const router = Router();
router.use(requireAuth);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().min(7),
  user_type: z.union([z.enum(['TECH', 'CLIENT']), z.number().int().positive()]),
  password: z.string().min(8).optional(),
  company: z.string().min(2).optional(),
  role: z.string().min(2).optional(),
  techRoleIds: z.array(z.number().int().positive()).optional(),
  stakeholder_role_id: z.number().int().positive().optional()
});

type UserRow = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: string;
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
  techRoles?: RoleRow[];
};

type RoleRow = {
  id: number;
  name: string;
};

type UserTypeRow = {
  id: number;
  code: string;
};

type TechUserRoleRow = {
  userId: number;
  id: number;
  name: string;
};

const resolveUserType = async (input: string | number): Promise<UserTypeRow | null> => {
  if (typeof input === 'number') {
    const byId = await pool.query<UserTypeRow>('SELECT id, code FROM user_types WHERE id = $1 LIMIT 1', [input]);
    return byId.rows[0] ?? null;
  }

  const byCode = await pool.query<UserTypeRow>(
    'SELECT id, code FROM user_types WHERE UPPER(code) = $1 LIMIT 1',
    [input.trim().toUpperCase()]
  );
  return byCode.rows[0] ?? null;
};

router.get('/', async (req, res) => {
  const typeParam = String(req.query.type || '').trim();
  const query = String(req.query.query || '').trim();

  if (!typeParam) {
    res.status(400).json({ message: 'Invalid user type' });
    return;
  }

  const resolvedType = await resolveUserType(typeParam);
  if (!resolvedType) {
    res.status(400).json({ message: 'Invalid user type' });
    return;
  }

  const params: Array<number | string> = [resolvedType.id];
  let whereQuery = '';

  if (query.length > 0) {
    whereQuery = 'AND (u.name ILIKE $2 OR u.email ILIKE $3)';
    const like = `%${query}%`;
    params.push(like, like);
  }

  const usersResult = await pool.query<UserRow>(
    `SELECT u.id,
            u.name,
            u.email,
            NULL::text AS "mobile",
            ut.code AS "userType",
            sp.company_name AS "companyName",
            sr.name AS "roleName",
            sp.stakeholder_role_id AS "stakeholderRoleId"
     FROM users u
     INNER JOIN user_types ut ON ut.id = u.user_type
     LEFT JOIN stakeholder_profile sp ON sp.user_id = u.id
     LEFT JOIN stakeholder_roles sr ON sp.stakeholder_role_id = sr.id
     WHERE u.user_type = $1 ${whereQuery}
     ORDER BY u.id DESC
     LIMIT 20`,
    params
  );

  const users = usersResult.rows.map((user: UserRow) => ({
    ...user,
    userType: user.userType.toUpperCase() as 'TECH' | 'CLIENT'
  }));

  if (resolvedType.code.toUpperCase() === 'TECH' && users.length > 0) {
    const userIds = users.map((row: UserRow) => row.id);
    const roleRowsResult = await pool.query<TechUserRoleRow>(
      `SELECT tur.user_id AS "userId", tr.id, tr.name
       FROM tech_user_roles tur
       INNER JOIN tech_roles tr ON tr.id = tur.role_id
       WHERE tur.user_id = ANY($1::int[])`,
      [userIds]
    );

    const roleMap = new Map<number, RoleRow[]>();
    roleRowsResult.rows.forEach((row: TechUserRoleRow) => {
      if (!roleMap.has(row.userId)) {
        roleMap.set(row.userId, []);
      }
      roleMap.get(row.userId)?.push({ id: row.id, name: row.name });
    });

    users.forEach((row: UserRow) => {
      row.techRoles = roleMap.get(row.id) ?? [];
    });
  }

  res.json({ users });
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
    user_type,
    password,
    company,
    role,
    techRoleIds,
    stakeholder_role_id
  } = parsed.data;

  const existing = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const resolvedType = await resolveUserType(user_type);
  if (!resolvedType) {
    res.status(400).json({ message: 'Invalid user type' });
    return;
  }

  const userTypeCode = resolvedType.code.toUpperCase() as 'TECH' | 'CLIENT';
  const normalizedTechRoleIds = techRoleIds ? Array.from(new Set(techRoleIds)) : [];

  if (userTypeCode === 'TECH' && !password) {
    res.status(400).json({ message: 'Password is required for TECH users' });
    return;
  }

  if (userTypeCode === 'TECH' && normalizedTechRoleIds.length === 0) {
    res.status(400).json({ message: 'Selecciona al menos un rol tecnico.' });
    return;
  }

  if (userTypeCode === 'CLIENT' && !company) {
    res.status(400).json({ message: 'Company is required for CLIENT users' });
    return;
  }

  if (userTypeCode === 'CLIENT' && !stakeholder_role_id && !role) {
    res.status(400).json({ message: 'Selecciona un rol de stakeholder.' });
    return;
  }

  if (userTypeCode === 'TECH' && normalizedTechRoleIds.length > 0) {
    const roleRows = await pool.query<RoleRow>('SELECT id FROM tech_roles WHERE id = ANY($1::int[])', [
      normalizedTechRoleIds
    ]);
    if (roleRows.rows.length !== normalizedTechRoleIds.length) {
      res.status(400).json({ message: 'Algunos roles técnicos no existen.' });
      return;
    }
  }

  let resolvedStakeholderRoleId: number | null = stakeholder_role_id ?? null;
  if (userTypeCode === 'CLIENT' && resolvedStakeholderRoleId) {
    const stakeholderRows = await pool.query<RoleRow>(
      'SELECT id FROM stakeholder_roles WHERE id = $1 LIMIT 1',
      [resolvedStakeholderRoleId]
    );
    if (stakeholderRows.rows.length === 0) {
      res.status(400).json({ message: 'El rol del stakeholder no existe.' });
      return;
    }
  }

  const hashed = userTypeCode === 'TECH' && password ? await hashPassword(password) : null;

  const userResult = await pool.query<{ id: number }>(
    'INSERT INTO users (name, email, password, user_type, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
    [name, email, hashed, resolvedType.id]
  );
  const userId = userResult.rows[0].id;

  if (userTypeCode === 'TECH' && normalizedTechRoleIds.length > 0) {
    for (const roleId of normalizedTechRoleIds) {
      await pool.query(
        'INSERT INTO tech_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, roleId]
      );
    }
  }

  if (userTypeCode === 'CLIENT') {
    if (!resolvedStakeholderRoleId && role) {
      const roleRows = await pool.query<RoleRow>(
        'SELECT id FROM stakeholder_roles WHERE name = $1 LIMIT 1',
        [role]
      );
      if (roleRows.rows.length > 0) {
        resolvedStakeholderRoleId = roleRows.rows[0].id;
      } else {
        const roleResult = await pool.query<RoleRow>(
          'INSERT INTO stakeholder_roles (name) VALUES ($1) RETURNING id',
          [role]
        );
        resolvedStakeholderRoleId = roleResult.rows[0].id;
      }
    }

    if (company || resolvedStakeholderRoleId) {
      await pool.query(
        'INSERT INTO stakeholder_profile (user_id, stakeholder_role_id, company_name) VALUES ($1, $2, $3)',
        [userId, resolvedStakeholderRoleId, company ?? null]
      );
    }
  }

  res.status(201).json({ id: userId });
});

export default router;
