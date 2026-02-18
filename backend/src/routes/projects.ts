import { Router } from 'express';
import { z } from 'zod';
import { getUserTypeIdByCode } from '../db/catalogs';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { hashPassword } from '../utils/password';

const router = Router();
router.use(requireAuth);
const PROJECT_MANAGER_ROLE_ID = 1;

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

type ProjectRow = {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ProjectUserRow = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: string;
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
};

type ProcessRow = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
};

type UserRow = {
  id: number;
};

type RoleRow = {
  id: number;
};

const hasProjectAccess = async (projectId: number, userId: number) => {
  const rows = await pool.query(
    'SELECT 1 FROM project_users WHERE project_id = $1 AND user_id = $2 LIMIT 1',
    [projectId, userId]
  );
  return rows.rows.length > 0;
};

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const rows = await pool.query<ProjectRow>(
    `SELECT p.id, p.name, p.description, p.start_date::text, p.end_date::text
     FROM projects p
     INNER JOIN project_users pu ON pu.project_id = p.id
     WHERE pu.user_id = $1
     ORDER BY p.id DESC`,
    [userId]
  );

  res.json({ projects: rows.rows });
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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const techTypeId = await getUserTypeIdByCode('TECH', client);
    const clientTypeId = await getUserTypeIdByCode('CLIENT', client);
    if (!techTypeId || !clientTypeId) {
      await client.query('ROLLBACK');
      res.status(500).json({ message: 'Catalog user_types missing TECH/CLIENT codes' });
      return;
    }

    const projectManagerRole = await client.query<RoleRow>(
      'SELECT id FROM tech_roles WHERE id = $1 LIMIT 1',
      [PROJECT_MANAGER_ROLE_ID]
    );
    if (projectManagerRole.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(500).json({ message: 'No existe el rol tecnico Project Manager (id 1).' });
      return;
    }

    let techUserId: number;
    if (techOwner.mode === 'existing') {
      const techRows = await client.query<UserRow>(
        'SELECT id FROM users WHERE id = $1 AND user_type = $2',
        [techOwner.userId, techTypeId]
      );
      if (techRows.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Responsable técnico no encontrado' });
        return;
      }
      techUserId = techRows.rows[0].id;
    } else {
      const existingTech = await client.query<UserRow>('SELECT id FROM users WHERE email = $1', [
        techOwner.email
      ]);
      if (existingTech.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ message: 'El correo del responsable técnico ya existe' });
        return;
      }

      const hashed = await hashPassword(techOwner.password);
      const techResult = await client.query<UserRow>(
        'INSERT INTO users (name, email, password, user_type, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
        [techOwner.name, techOwner.email, hashed, techTypeId]
      );
      techUserId = techResult.rows[0].id;

      await client.query(
        'INSERT INTO tech_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING',
        [techUserId, PROJECT_MANAGER_ROLE_ID]
      );
    }

    let clientUserId: number;
    if (clientOwner.mode === 'existing') {
      const clientRows = await client.query<UserRow>(
        'SELECT id FROM users WHERE id = $1 AND user_type = $2',
        [clientOwner.userId, clientTypeId]
      );
      if (clientRows.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Responsable del cliente no encontrado' });
        return;
      }
      clientUserId = clientRows.rows[0].id;
    } else {
      const existingClient = await client.query<UserRow>('SELECT id FROM users WHERE email = $1', [
        clientOwner.email
      ]);
      if (existingClient.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ message: 'El correo del responsable del cliente ya existe' });
        return;
      }

      const clientResult = await client.query<UserRow>(
        'INSERT INTO users (name, email, password, user_type, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
        [clientOwner.name, clientOwner.email, null, clientTypeId]
      );
      clientUserId = clientResult.rows[0].id;

      let stakeholderRoleId: number;
      const roleRows = await client.query<RoleRow>(
        'SELECT id FROM stakeholder_roles WHERE name = $1 LIMIT 1',
        [clientOwner.role]
      );
      if (roleRows.rows.length > 0) {
        stakeholderRoleId = roleRows.rows[0].id;
      } else {
        const roleResult = await client.query<RoleRow>(
          'INSERT INTO stakeholder_roles (name) VALUES ($1) RETURNING id',
          [clientOwner.role]
        );
        stakeholderRoleId = roleResult.rows[0].id;
      }

      await client.query(
        'INSERT INTO stakeholder_profile (user_id, stakeholder_role_id, company_name) VALUES ($1, $2, $3)',
        [clientUserId, stakeholderRoleId, clientOwner.company]
      );
    }

    const projectResult = await client.query<ProjectRow>(
      'INSERT INTO projects (name, description, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
      [project.name, project.description ?? null, project.start_date ?? null, project.end_date ?? null]
    );
    const projectId = projectResult.rows[0].id;

    await client.query(
      'INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING',
      [projectId, techUserId]
    );
    await client.query(
      'INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING',
      [projectId, clientUserId]
    );
    await client.query(
      'INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING',
      [projectId, userId]
    );

    await client.query('COMMIT');

    res.status(201).json({ projectId, techUserId, clientUserId });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'No se pudo crear el proyecto.' });
  } finally {
    client.release();
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

  const result = await pool.query<ProjectRow>(
    'INSERT INTO projects (name, description, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, description ?? null, start_date ?? null, end_date ?? null]
  );

  const projectId = result.rows[0].id;
  await pool.query(
    'INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING',
    [projectId, userId]
  );

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

  const rows = await pool.query<ProjectRow>(
    `SELECT p.id, p.name, p.description, p.start_date::text, p.end_date::text
     FROM projects p
     INNER JOIN project_users pu ON pu.project_id = p.id
     WHERE p.id = $1 AND pu.user_id = $2
     LIMIT 1`,
    [id, userId]
  );

  if (rows.rows.length === 0) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  res.json({ project: rows.rows[0] });
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

  const rows = await pool.query<ProjectUserRow>(
    `SELECT u.id,
            u.name,
            u.email,
            NULL::text AS "mobile",
            ut.code AS "userType",
            sp.company_name AS "companyName",
            sr.name AS "roleName",
            sp.stakeholder_role_id AS "stakeholderRoleId"
     FROM project_users pu
     INNER JOIN users u ON u.id = pu.user_id
     INNER JOIN user_types ut ON ut.id = u.user_type
     LEFT JOIN stakeholder_profile sp ON sp.user_id = u.id
     LEFT JOIN stakeholder_roles sr ON sp.stakeholder_role_id = sr.id
     WHERE pu.project_id = $1
     ORDER BY u.id DESC`,
    [id]
  );

  const normalizedRows = rows.rows.map((row: ProjectUserRow) => ({
    ...row,
    userType: row.userType.toUpperCase() as 'TECH' | 'CLIENT'
  }));

  const techUsers = normalizedRows.filter((row: ProjectUserRow) => row.userType === 'TECH');
  const clientUsers = normalizedRows.filter((row: ProjectUserRow) => row.userType === 'CLIENT');

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

  const userRows = await pool.query<UserRow>('SELECT id FROM users WHERE id = $1', [parsed.data.userId]);
  if (userRows.rows.length === 0) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  await pool.query(
    'INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING',
    [id, parsed.data.userId]
  );

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
  const result = await pool.query(
    'UPDATE projects SET name = $1, description = $2, start_date = $3, end_date = $4 WHERE id = $5',
    [name, description ?? null, start_date ?? null, end_date ?? null, id]
  );

  if (result.rowCount === 0) {
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

  const rows = await pool.query<ProcessRow>(
    'SELECT id, project_id, name, description FROM processes WHERE project_id = $1 ORDER BY id DESC',
    [projectId]
  );

  res.json({ processes: rows.rows });
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

  const result = await pool.query<ProcessRow>(
    'INSERT INTO processes (project_id, name, description) VALUES ($1, $2, $3) RETURNING id',
    [projectId, name, description ?? null]
  );

  res.status(201).json({ id: result.rows[0].id });
});

export default router;
