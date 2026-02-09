import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { hashPassword } from '../utils/password';

const router = Router();
router.use(requireAuth);

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable()
});

const processSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

const projectUserSchema = z.object({
  userId: z.number().int().positive()
});

const techOwnerSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    userId: z.number().int().positive()
  }),
  z.object({
    mode: z.literal('create'),
    name: z.string().min(2),
    email: z.string().email(),
    mobile: z.string().min(7),
    password: z.string().min(8)
  })
]);

const clientOwnerSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    userId: z.number().int().positive()
  }),
  z.object({
    mode: z.literal('create'),
    name: z.string().min(2),
    email: z.string().email(),
    mobile: z.string().min(7),
    company: z.string().min(2),
    role: z.string().min(2)
  })
]);

const wizardSchema = z.object({
  project: projectSchema,
  techOwner: techOwnerSchema,
  clientOwner: clientOwnerSchema
});

type ProjectRow = RowDataPacket & {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ProjectUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: 'TECH' | 'CLIENT';
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
};

type ProcessRow = RowDataPacket & {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
};

type UserRow = RowDataPacket & {
  id: number;
};

type RoleRow = RowDataPacket & {
  id: number;
};

const hasProjectAccess = async (projectId: number, userId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM project_users WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, userId]
  );
  return rows.length > 0;
};

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT p.id, p.name, p.description, p.start_date, p.end_date
     FROM projects p
     INNER JOIN project_users pu ON pu.project_id = p.id
     WHERE pu.user_id = ?
     ORDER BY p.id DESC`,
    [userId]
  );

  res.json({ projects: rows });
});

router.post('/wizard', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const parsed = wizardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { project, techOwner, clientOwner } = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    let techUserId: number;
    if (techOwner.mode === 'existing') {
      const [techRows] = await connection.query<UserRow[]>(
        'SELECT id FROM users WHERE id = ? AND user_type = ?',
        [techOwner.userId, 'TECH']
      );
      if (techRows.length === 0) {
        await connection.rollback();
        res.status(404).json({ message: 'Responsable técnico no encontrado' });
        return;
      }
      techUserId = techRows[0].id;
    } else {
      const [existingTech] = await connection.query<UserRow[]>(
        'SELECT id FROM users WHERE email = ?',
        [techOwner.email]
      );
      if (existingTech.length > 0) {
        await connection.rollback();
        res.status(409).json({ message: 'El correo del responsable técnico ya existe' });
        return;
      }

      const hashed = await hashPassword(techOwner.password);
      const [techResult] = await connection.query<ResultSetHeader>(
        'INSERT INTO users (name, email, password, user_type, created_at, mobile) VALUES (?, ?, ?, ?, ?, ?)',
        [techOwner.name, techOwner.email, hashed, 'TECH', new Date(), techOwner.mobile]
      );
      techUserId = techResult.insertId;
    }

    let clientUserId: number;
    if (clientOwner.mode === 'existing') {
      const [clientRows] = await connection.query<UserRow[]>(
        'SELECT id FROM users WHERE id = ? AND user_type = ?',
        [clientOwner.userId, 'CLIENT']
      );
      if (clientRows.length === 0) {
        await connection.rollback();
        res.status(404).json({ message: 'Responsable del cliente no encontrado' });
        return;
      }
      clientUserId = clientRows[0].id;
    } else {
      const [existingClient] = await connection.query<UserRow[]>(
        'SELECT id FROM users WHERE email = ?',
        [clientOwner.email]
      );
      if (existingClient.length > 0) {
        await connection.rollback();
        res.status(409).json({ message: 'El correo del responsable del cliente ya existe' });
        return;
      }

      const [clientResult] = await connection.query<ResultSetHeader>(
        'INSERT INTO users (name, email, password, user_type, created_at, mobile) VALUES (?, ?, ?, ?, ?, ?)',
        [clientOwner.name, clientOwner.email, null, 'CLIENT', new Date(), clientOwner.mobile]
      );
      clientUserId = clientResult.insertId;

      let stakeholderRoleId: number | null = null;
      const [roleRows] = await connection.query<RoleRow[]>(
        'SELECT id FROM stakeholder_roles WHERE name = ?',
        [clientOwner.role]
      );
      if (roleRows.length > 0) {
        stakeholderRoleId = roleRows[0].id;
      } else {
        const [roleResult] = await connection.query<ResultSetHeader>(
          'INSERT INTO stakeholder_roles (name) VALUES (?)',
          [clientOwner.role]
        );
        stakeholderRoleId = roleResult.insertId;
      }

      await connection.query(
        'INSERT INTO stakeholder_profile (user_id, stakeholder_role_id, company_name) VALUES (?, ?, ?)',
        [clientUserId, stakeholderRoleId, clientOwner.company]
      );
    }

    const [projectResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO projects (name, description, start_date, end_date) VALUES (?, ?, ?, ?)',
      [
        project.name,
        project.description ?? null,
        project.start_date ?? null,
        project.end_date ?? null
      ]
    );
    const projectId = projectResult.insertId;

    await connection.query('INSERT IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)', [
      projectId,
      techUserId
    ]);
    await connection.query('INSERT IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)', [
      projectId,
      clientUserId
    ]);
    await connection.query('INSERT IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)', [
      projectId,
      userId
    ]);

    await connection.commit();

    res.status(201).json({ projectId, techUserId, clientUserId });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'No se pudo crear el proyecto.' });
  } finally {
    connection.release();
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description, start_date, end_date } = parsed.data;

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO projects (name, description, start_date, end_date) VALUES (?, ?, ?, ?)',
    [name, description ?? null, start_date ?? null, end_date ?? null]
  );

  const projectId = result.insertId;
  await pool.query('INSERT IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)', [
    projectId,
    userId
  ]);

  res.status(201).json({ id: projectId });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT p.id, p.name, p.description, p.start_date, p.end_date
     FROM projects p
     INNER JOIN project_users pu ON pu.project_id = p.id
     WHERE p.id = ? AND pu.user_id = ?
     LIMIT 1`,
    [id, userId]
  );

  if (rows.length === 0) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  res.json({ project: rows[0] });
});

router.get('/:id/users', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const [rows] = await pool.query<ProjectUserRow[]>(
    `SELECT u.id, u.name, u.email, u.mobile, u.user_type as userType,
            sp.company_name as companyName, sr.name as roleName,
            sp.stakeholder_role_id as stakeholderRoleId
     FROM project_users pu
     INNER JOIN users u ON u.id = pu.user_id
     LEFT JOIN stakeholder_profile sp ON sp.user_id = u.id
     LEFT JOIN stakeholder_roles sr ON sp.stakeholder_role_id = sr.id
     WHERE pu.project_id = ?
     ORDER BY u.id DESC`,
    [id]
  );

  const techUsers = rows.filter((row) => row.userType === 'TECH');
  const clientUsers = rows.filter((row) => row.userType === 'CLIENT');

  res.json({ techUsers, clientUsers });
});

router.post('/:id/users', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = projectUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const [userRows] = await pool.query<UserRow[]>(
    'SELECT id FROM users WHERE id = ?',
    [parsed.data.userId]
  );
  if (userRows.length === 0) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  await pool.query('INSERT IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)', [
    id,
    parsed.data.userId
  ]);

  res.status(201).json({ message: 'User added to project' });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(id)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description, start_date, end_date } = parsed.data;
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE projects SET name = ?, description = ?, start_date = ?, end_date = ? WHERE id = ?',
    [name, description ?? null, start_date ?? null, end_date ?? null, id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  res.json({ message: 'Project updated' });
});

router.get('/:id/processes', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(projectId)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const [rows] = await pool.query<ProcessRow[]>(
    'SELECT id, project_id, name, description FROM processes WHERE project_id = ? ORDER BY id DESC',
    [projectId]
  );

  res.json({ processes: rows });
});

router.post('/:id/processes', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (Number.isNaN(projectId)) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = processSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO processes (project_id, name, description) VALUES (?, ?, ?)',
    [projectId, name, description ?? null]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;
