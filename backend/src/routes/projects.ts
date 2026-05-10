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
  objective: z.string().min(1).optional().nullable(),
  scope: z.string().optional().nullable(),
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
  objective: string | null;
  scope: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

type StakeholderRow = {
  id: number;
  project_id: number;
  name: string;
  role: string;
  type: 'internal' | 'external';
  contact: string | null;
  created_at: string;
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

type SessionRow = {
  id: number;
  project_id: number;
  title: string;
  technique: string;
  notes: string | null;
  occurred_at: string;
  created_at: string;
  stakeholder_count: number;
  evidence_count: number;
  finding_count: number;
};

type FindingRow = {
  id: number;
  session_id: number;
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  dedupe_key: string | null;
  created_at: string;
  session_title: string;
  session_technique: string;
  occurred_at: string;
};

type RequirementRow = {
  id: number;
  project_id: number;
  code: string;
  type: 'functional' | 'non_functional';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  acceptance_criteria: string;
  created_at: string;
  finding_ids: number[] | null;
  finding_count: number;
};

type TraceabilityRow = {
  requirement_id: number;
  requirement_code: string;
  requirement_type: 'functional' | 'non_functional';
  requirement_priority: 'low' | 'medium' | 'high' | 'critical';
  requirement_description: string;
  requirement_acceptance_criteria: string;
  finding_id: number;
  finding_category: 'problem' | 'need' | 'constraint';
  finding_statement: string;
  session_id: number;
  session_title: string;
  session_technique: string;
  session_occurred_at: string;
  stakeholders: Array<{
    id: number;
    name: string;
    role: string;
    type: 'internal' | 'external';
    contact: string | null;
  }> | null;
  evidences: Array<{
    id: number;
    kind: 'file' | 'note' | 'audio' | 'transcript';
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    notes: string | null;
    created_at: string;
  }> | null;
};

type UserRow = {
  id: number;
};

type RoleRow = {
  id: number;
};

type FlowStatusProjectRow = {
  objective: string | null;
};

type FlowStatusCountsRow = {
  stakeholders_count: number;
  sessions_count: number;
  sessions_without_evidence_count: number;
  findings_count: number;
  requirements_count: number;
  trace_links_count: number;
};

type FlowStepState = {
  complete: boolean;
  locked: boolean;
};

type FlowStatus = {
  progress_percent: number;
  completed_steps: number;
  steps: {
    step1: FlowStepState;
    step2: FlowStepState;
    step3: FlowStepState;
    step4: FlowStepState;
    step5: FlowStepState;
  };
  counts: FlowStatusCountsRow;
  next_action: {
    step: number;
    route: string;
    message: string;
  };
};

const stakeholderSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(2),
  type: z.enum(['internal', 'external']).default('external'),
  contact: z.string().optional().nullable()
});

const createSessionSchema = z.object({
  title: z.string().min(2),
  technique: z.string().min(2),
  notes: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
  stakeholder_ids: z.array(z.number().int().positive()).min(1)
});

const createRequirementSchema = z.object({
  type: z.enum(['functional', 'non_functional']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(12),
  acceptance_criteria: z.string().min(12),
  finding_ids: z.array(z.number().int().positive()).min(1)
});

const hasProjectAccess = async (projectId: number, userId: number) => {
  const rows = await pool.query(
    'SELECT 1 FROM project_users WHERE project_id = $1 AND user_id = $2 LIMIT 1',
    [projectId, userId]
  );
  return rows.rows.length > 0;
};

const normalizeOccurredAt = (value?: string | null): string => {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'INVALID_DATE';
  }
  return date.toISOString();
};

const buildRequirementCode = async (
  projectId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<string> => {
  const sequenceResult = await db.query<{ next_value: number }>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '\\d+$') AS INTEGER)), 0) + 1 AS next_value
     FROM trace_requirements
     WHERE project_id = $1`,
    [projectId]
  );

  const nextValue = sequenceResult.rows[0]?.next_value ?? 1;
  return `REQ-${String(nextValue).padStart(4, '0')}`;
};

const computeFlowStatus = async (
  projectId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<FlowStatus | null> => {
  const projectRows = await db.query<FlowStatusProjectRow>(
    `SELECT objective
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId]
  );

  if (projectRows.rows.length === 0) {
    return null;
  }

  const countRows = await db.query<FlowStatusCountsRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM trace_stakeholders st WHERE st.project_id = $1) AS stakeholders_count,
       (SELECT COUNT(*)::int FROM trace_sessions s WHERE s.project_id = $1) AS sessions_count,
       (
         SELECT COUNT(*)::int
         FROM trace_sessions s
         WHERE s.project_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM trace_evidences e
             WHERE e.session_id = s.id
           )
       ) AS sessions_without_evidence_count,
       (
         SELECT COUNT(*)::int
         FROM trace_findings f
         INNER JOIN trace_sessions s ON s.id = f.session_id
         WHERE s.project_id = $1
       ) AS findings_count,
       (SELECT COUNT(*)::int FROM trace_requirements r WHERE r.project_id = $1) AS requirements_count,
       (
         SELECT COUNT(*)::int
         FROM trace_requirement_findings rf
         INNER JOIN trace_requirements r ON r.id = rf.requirement_id
         WHERE r.project_id = $1
       ) AS trace_links_count`,
    [projectId]
  );

  const counts = countRows.rows[0] ?? {
    stakeholders_count: 0,
    sessions_count: 0,
    sessions_without_evidence_count: 0,
    findings_count: 0,
    requirements_count: 0,
    trace_links_count: 0
  };

  const hasObjective = Boolean(projectRows.rows[0].objective?.trim());
  const step1Complete = hasObjective && counts.stakeholders_count > 0;
  const step2Complete =
    step1Complete && counts.sessions_count > 0 && counts.sessions_without_evidence_count === 0;
  const step3Complete = step2Complete && counts.findings_count > 0;
  const step4Complete = step3Complete && counts.requirements_count > 0;
  const step5Complete = step4Complete && counts.trace_links_count > 0;

  const completedSteps = [step1Complete, step2Complete, step3Complete, step4Complete, step5Complete].filter(
    Boolean
  ).length;

  let nextAction: FlowStatus['next_action'];
  if (!hasObjective) {
    nextAction = {
      step: 1,
      route: `/projects/${projectId}`,
      message: 'Define the project objective before continuing.'
    };
  } else if (counts.stakeholders_count < 1) {
    nextAction = {
      step: 1,
      route: `/projects/${projectId}`,
      message: 'Add at least one stakeholder.'
    };
  } else if (counts.sessions_count < 1) {
    nextAction = {
      step: 2,
      route: `/projects/${projectId}/sessions`,
      message: 'Create at least one session.'
    };
  } else if (counts.sessions_without_evidence_count > 0) {
    nextAction = {
      step: 2,
      route: `/projects/${projectId}/sessions`,
      message: 'Every session must include at least one evidence before findings.'
    };
  } else if (counts.findings_count < 1) {
    nextAction = {
      step: 3,
      route: `/projects/${projectId}/findings`,
      message: 'Create findings from session evidence.'
    };
  } else if (counts.requirements_count < 1) {
    nextAction = {
      step: 4,
      route: `/projects/${projectId}/requirements`,
      message: 'Create requirements from findings.'
    };
  } else if (counts.trace_links_count < 1) {
    nextAction = {
      step: 5,
      route: `/projects/${projectId}/traceability`,
      message: 'Review and validate traceability links.'
    };
  } else {
    nextAction = {
      step: 5,
      route: `/projects/${projectId}/traceability`,
      message: 'Traceability chain is complete.'
    };
  }

  return {
    progress_percent: Math.round((completedSteps / 5) * 100),
    completed_steps: completedSteps,
    steps: {
      step1: { complete: step1Complete, locked: false },
      step2: { complete: step2Complete, locked: !step1Complete },
      step3: { complete: step3Complete, locked: !step2Complete },
      step4: { complete: step4Complete, locked: !step3Complete },
      step5: { complete: step5Complete, locked: !step4Complete }
    },
    counts,
    next_action: nextAction
  };
};

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const rows = await pool.query<ProjectRow>(
    `SELECT p.id,
            p.name,
            p.objective,
            p.scope,
            p.description,
            p.start_date::text,
            p.end_date::text
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
      `INSERT INTO projects (name, objective, scope, description, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        project.name,
        project.objective ?? project.description ?? null,
        project.scope ?? null,
        project.description ?? null,
        project.start_date ?? null,
        project.end_date ?? null
      ]
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

  const { name, objective, scope, description, start_date, end_date } = parsed.data;

  const result = await pool.query<ProjectRow>(
    `INSERT INTO projects (name, objective, scope, description, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [name, objective ?? description ?? null, scope ?? null, description ?? null, start_date ?? null, end_date ?? null]
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
    `SELECT p.id,
            p.name,
            p.objective,
            p.scope,
            p.description,
            p.start_date::text,
            p.end_date::text
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

router.get('/:id/flow-status', async (req: AuthRequest, res) => {
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

  const flowStatus = await computeFlowStatus(projectId);
  if (!flowStatus) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  res.json({ flow_status: flowStatus });
});

router.get('/:id/stakeholders', async (req: AuthRequest, res) => {
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

  const rows = await pool.query<StakeholderRow>(
    `SELECT id,
            project_id,
            name,
            role,
            type,
            contact,
            created_at::text
     FROM trace_stakeholders
     WHERE project_id = $1
     ORDER BY id DESC`,
    [projectId]
  );

  res.json({ stakeholders: rows.rows });
});

router.post('/:id/stakeholders', async (req: AuthRequest, res) => {
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

  const parsed = stakeholderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, role, type, contact } = parsed.data;
  const result = await pool.query<StakeholderRow>(
    `INSERT INTO trace_stakeholders (project_id, name, role, type, contact)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, project_id, name, role, type, contact, created_at::text`,
    [projectId, name, role, type, contact ?? null]
  );

  res.status(201).json({ stakeholder: result.rows[0] });
});

router.get('/:id/sessions', async (req: AuthRequest, res) => {
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

  const rows = await pool.query<SessionRow>(
    `SELECT s.id,
            s.project_id,
            s.title,
            s.technique,
            s.notes,
            s.occurred_at::text,
            s.created_at::text,
            COALESCE(sc.stakeholder_count, 0)::int AS stakeholder_count,
            COALESCE(ec.evidence_count, 0)::int AS evidence_count,
            COALESCE(fc.finding_count, 0)::int AS finding_count
     FROM trace_sessions s
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS stakeholder_count
       FROM trace_session_stakeholders ss
       WHERE ss.session_id = s.id
     ) sc ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS evidence_count
       FROM trace_evidences e
       WHERE e.session_id = s.id
     ) ec ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS finding_count
       FROM trace_findings f
       WHERE f.session_id = s.id
     ) fc ON TRUE
     WHERE s.project_id = $1
     ORDER BY s.occurred_at DESC, s.id DESC`,
    [projectId]
  );

  res.json({ sessions: rows.rows });
});

router.post('/:id/sessions', async (req: AuthRequest, res) => {
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

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const occurredAt = normalizeOccurredAt(parsed.data.occurred_at);
  if (occurredAt === 'INVALID_DATE') {
    res.status(400).json({ message: 'Invalid occurred_at format' });
    return;
  }

  const uniqueStakeholderIds = Array.from(new Set(parsed.data.stakeholder_ids));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stakeholderRows = await client.query<{ id: number }>(
      `SELECT id
       FROM trace_stakeholders
       WHERE project_id = $1
         AND id = ANY($2::int[])`,
      [projectId, uniqueStakeholderIds]
    );

    if (stakeholderRows.rows.length !== uniqueStakeholderIds.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some stakeholders do not belong to this project' });
      return;
    }

    const sessionResult = await client.query<{ id: number }>(
      `INSERT INTO trace_sessions (project_id, technique, title, notes, occurred_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [projectId, parsed.data.technique, parsed.data.title, parsed.data.notes ?? null, occurredAt]
    );
    const sessionId = sessionResult.rows[0].id;

    for (const stakeholderId of uniqueStakeholderIds) {
      await client.query(
        `INSERT INTO trace_session_stakeholders (session_id, stakeholder_id)
         VALUES ($1, $2)
         ON CONFLICT (session_id, stakeholder_id) DO NOTHING`,
        [sessionId, stakeholderId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: sessionId });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not create session.' });
  } finally {
    client.release();
  }
});

router.get('/:id/findings', async (req: AuthRequest, res) => {
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

  const rows = await pool.query<FindingRow>(
    `SELECT f.id,
            f.session_id,
            f.category,
            f.statement,
            f.dedupe_key,
            f.created_at::text,
            s.title AS session_title,
            s.technique AS session_technique,
            s.occurred_at::text
     FROM trace_findings f
     INNER JOIN trace_sessions s ON s.id = f.session_id
     WHERE s.project_id = $1
     ORDER BY f.id DESC`,
    [projectId]
  );

  res.json({ findings: rows.rows });
});

router.get('/:id/requirements', async (req: AuthRequest, res) => {
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

  const rows = await pool.query<RequirementRow>(
    `SELECT r.id,
            r.project_id,
            r.code,
            r.type,
            r.priority,
            r.description,
            r.acceptance_criteria,
            r.created_at::text,
            links.finding_ids,
            COALESCE(array_length(links.finding_ids, 1), 0)::int AS finding_count
     FROM trace_requirements r
     LEFT JOIN LATERAL (
       SELECT array_agg(rf.finding_id ORDER BY rf.finding_id) AS finding_ids
       FROM trace_requirement_findings rf
       WHERE rf.requirement_id = r.id
     ) links ON TRUE
     WHERE r.project_id = $1
     ORDER BY r.id DESC`,
    [projectId]
  );

  res.json({ requirements: rows.rows });
});

router.post('/:id/requirements', async (req: AuthRequest, res) => {
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

  const parsed = createRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const findingIds = Array.from(new Set(parsed.data.finding_ids));
  if (findingIds.length === 0) {
    res.status(400).json({ message: 'At least one finding is required to create a requirement' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const findingRows = await client.query<{ id: number }>(
      `SELECT f.id
       FROM trace_findings f
       INNER JOIN trace_sessions s ON s.id = f.session_id
       WHERE s.project_id = $1
         AND f.id = ANY($2::int[])`,
      [projectId, findingIds]
    );

    if (findingRows.rows.length !== findingIds.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'All finding_ids must belong to this project' });
      return;
    }

    const findingWithoutEvidenceRows = await client.query<{ id: number }>(
      `SELECT f.id
       FROM trace_findings f
       INNER JOIN trace_sessions s ON s.id = f.session_id
       WHERE s.project_id = $1
         AND f.id = ANY($2::int[])
         AND NOT EXISTS (
           SELECT 1
           FROM trace_evidences e
           WHERE e.session_id = s.id
         )
       LIMIT 1`,
      [projectId, findingIds]
    );

    if (findingWithoutEvidenceRows.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        message: 'Requirements can only use findings from sessions with at least one evidence.'
      });
      return;
    }

    const code = await buildRequirementCode(projectId, client);
    const requirementResult = await client.query<{ id: number }>(
      `INSERT INTO trace_requirements
       (project_id, code, type, priority, description, acceptance_criteria)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        projectId,
        code,
        parsed.data.type,
        parsed.data.priority,
        parsed.data.description,
        parsed.data.acceptance_criteria
      ]
    );

    const requirementId = requirementResult.rows[0].id;
    for (const findingId of findingIds) {
      await client.query(
        `INSERT INTO trace_requirement_findings (requirement_id, finding_id)
         VALUES ($1, $2)
         ON CONFLICT (requirement_id, finding_id) DO NOTHING`,
        [requirementId, findingId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: requirementId, code });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not create requirement.' });
  } finally {
    client.release();
  }
});

router.get('/:id/traceability', async (req: AuthRequest, res) => {
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

  const rows = await pool.query<TraceabilityRow>(
    `SELECT r.id AS requirement_id,
            r.code AS requirement_code,
            r.type AS requirement_type,
            r.priority AS requirement_priority,
            r.description AS requirement_description,
            r.acceptance_criteria AS requirement_acceptance_criteria,
            f.id AS finding_id,
            f.category AS finding_category,
            f.statement AS finding_statement,
            s.id AS session_id,
            s.title AS session_title,
            s.technique AS session_technique,
            s.occurred_at::text AS session_occurred_at,
            COALESCE(stakeholders.items, '[]'::json) AS stakeholders,
            COALESCE(evidences.items, '[]'::json) AS evidences
     FROM trace_requirements r
     INNER JOIN trace_requirement_findings rf ON rf.requirement_id = r.id
     INNER JOIN trace_findings f ON f.id = rf.finding_id
     INNER JOIN trace_sessions s ON s.id = f.session_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'id', st.id,
           'name', st.name,
           'role', st.role,
           'type', st.type,
           'contact', st.contact
         )
         ORDER BY st.id
       ) AS items
       FROM trace_session_stakeholders ss
       INNER JOIN trace_stakeholders st ON st.id = ss.stakeholder_id
       WHERE ss.session_id = s.id
     ) stakeholders ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'id', e.id,
           'kind', e.kind,
           'file_name', e.file_name,
           'mime_type', e.mime_type,
           'size_bytes', e.size_bytes,
           'notes', e.notes,
           'created_at', e.created_at::text
         )
         ORDER BY e.id
       ) AS items
       FROM trace_evidences e
       WHERE e.session_id = s.id
     ) evidences ON TRUE
     WHERE r.project_id = $1
     ORDER BY r.id DESC, f.id DESC`,
    [projectId]
  );

  const requirementsMap = new Map<
    number,
    {
      id: number;
      code: string;
      type: string;
      priority: string;
      description: string;
      acceptance_criteria: string;
      links: Array<{
        finding: { id: number; category: string; statement: string };
        session: { id: number; title: string; technique: string; occurred_at: string };
        stakeholders: TraceabilityRow['stakeholders'];
        evidences: TraceabilityRow['evidences'];
      }>;
    }
  >();

  for (const row of rows.rows) {
    if (!requirementsMap.has(row.requirement_id)) {
      requirementsMap.set(row.requirement_id, {
        id: row.requirement_id,
        code: row.requirement_code,
        type: row.requirement_type,
        priority: row.requirement_priority,
        description: row.requirement_description,
        acceptance_criteria: row.requirement_acceptance_criteria,
        links: []
      });
    }

    requirementsMap.get(row.requirement_id)?.links.push({
      finding: {
        id: row.finding_id,
        category: row.finding_category,
        statement: row.finding_statement
      },
      session: {
        id: row.session_id,
        title: row.session_title,
        technique: row.session_technique,
        occurred_at: row.session_occurred_at
      },
      stakeholders: row.stakeholders ?? [],
      evidences: row.evidences ?? []
    });
  }

  res.json({ traceability: Array.from(requirementsMap.values()) });
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

  const { name, objective, scope, description, start_date, end_date } = parsed.data;
  const result = await pool.query(
    `UPDATE projects
     SET name = $1,
         objective = $2,
         scope = $3,
         description = $4,
         start_date = $5,
         end_date = $6
     WHERE id = $7`,
    [name, objective ?? description ?? null, scope ?? null, description ?? null, start_date ?? null, end_date ?? null, id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  res.json({ message: 'Project updated' });
});
// DEPRECATED (traceability refactor):
// Legacy project->processes endpoints are retained for compatibility.
// New flow should use sessions/findings/requirements/traceability.
router.get('/:id/processes', async (req: AuthRequest, res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'Warning',
    '299 - "Deprecated endpoint. Migrate to /projects/:id/sessions and traceability flow endpoints."'
  );
  // eslint-disable-next-line no-console
  console.warn(`[DEPRECATED] ${req.method} ${req.originalUrl}`);

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
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'Warning',
    '299 - "Deprecated endpoint. Migrate to /projects/:id/sessions and traceability flow endpoints."'
  );
  // eslint-disable-next-line no-console
  console.warn(`[DEPRECATED] ${req.method} ${req.originalUrl}`);

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

