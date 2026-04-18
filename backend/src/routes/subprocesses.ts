import { Router } from 'express';
import { z } from 'zod';
import { getTechniqueStatusIdByCode } from '../db/catalogs';
import { pool } from '../db/pool';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const subprocessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

const techniqueStatusSchema = z.enum(['PLANNED', 'DONE', 'CANCELLED']);

const assignTechniqueSchema = z.object({
  technique_id: z.number().int().positive(),
  tech_user_id: z.number().int().positive().optional().nullable(),
  stakeholder_user_ids: z.array(z.number().int().positive()).optional(),
  scheduled_date: z.string().optional().nullable(),
  duration_minutes: z.number().int().positive().optional().nullable(),
  status: techniqueStatusSchema.optional()
});

const updateTechniqueAssignmentSchema = z
  .object({
    technique_id: z.number().int().positive().optional(),
    tech_user_id: z.number().int().positive().optional().nullable(),
    stakeholder_user_ids: z.array(z.number().int().positive()).optional(),
    scheduled_date: z.string().optional().nullable(),
    duration_minutes: z.number().int().positive().optional().nullable(),
    status: techniqueStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

type SubprocessRow = {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

type SubprocessContextRow = {
  subprocess_id: number;
  process_id: number;
  project_id: number;
};

type TechniqueRow = {
  id: number;
  name: string;
  description: string | null;
};

type SubprocessTechniqueRow = {
  id: number;
  subprocess_id: number;
  technique_id: number;
  tech_user_id: number | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: string;
  name: string;
  description: string | null;
  tech_user_name: string | null;
  tech_user_email: string | null;
};

type StakeholderAssignmentRow = {
  assignment_id: number;
  stakeholder_user_id: number;
  stakeholder_name: string | null;
  stakeholder_email: string | null;
};

type UserIdRow = {
  id: number;
};

type ExistingAssignmentRow = {
  id: number;
  subprocess_id: number;
  technique_id: number;
  tech_user_id: number | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: string;
};

const parseId = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeUserIds = (ids: number[] | undefined): number[] =>
  ids ? Array.from(new Set(ids)) : [];

const normalizeScheduledDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'INVALID_DATE';
  }

  return parsed.toISOString();
};

const hasSubprocessAccess = async (subprocessId: number, userId: number) => {
  const rows = await pool.query(
    `SELECT 1
     FROM subprocesses sp
     INNER JOIN processes p ON p.id = sp.process_id
     INNER JOIN project_users pu ON pu.project_id = p.project_id
     WHERE sp.id = $1 AND pu.user_id = $2
     LIMIT 1`,
    [subprocessId, userId]
  );
  return rows.rows.length > 0;
};

const getSubprocessContext = async (
  subprocessId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<SubprocessContextRow | null> => {
  const rows = await db.query<SubprocessContextRow>(
    `SELECT sp.id AS subprocess_id, sp.process_id, p.project_id
     FROM subprocesses sp
     INNER JOIN processes p ON p.id = sp.process_id
     WHERE sp.id = $1
     LIMIT 1`,
    [subprocessId]
  );

  return rows.rows[0] ?? null;
};

const validateTechMemberInProject = async (
  projectId: number,
  techUserId: number | null,
  db: Pick<typeof pool, 'query'> = pool
): Promise<boolean> => {
  if (!techUserId) {
    return true;
  }

  const rows = await db.query<UserIdRow>(
    `SELECT u.id
     FROM project_users pu
     INNER JOIN users u ON u.id = pu.user_id
     INNER JOIN user_types ut ON ut.id = u.user_type
     WHERE pu.project_id = $1
       AND u.id = $2
       AND UPPER(ut.code) = 'TECH'
     LIMIT 1`,
    [projectId, techUserId]
  );

  return rows.rows.length > 0;
};

const validateStakeholdersInProject = async (
  projectId: number,
  stakeholderIds: number[],
  db: Pick<typeof pool, 'query'> = pool
): Promise<boolean> => {
  if (stakeholderIds.length === 0) {
    return true;
  }

  const rows = await db.query<UserIdRow>(
    `SELECT u.id
     FROM project_users pu
     INNER JOIN users u ON u.id = pu.user_id
     INNER JOIN user_types ut ON ut.id = u.user_type
     WHERE pu.project_id = $1
       AND u.id = ANY($2::int[])
       AND UPPER(ut.code) = 'CLIENT'`,
    [projectId, stakeholderIds]
  );

  return rows.rows.length === stakeholderIds.length;
};

const getTechniqueAssignmentById = async (
  subprocessId: number,
  assignmentId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<ExistingAssignmentRow | null> => {
  const rows = await db.query<ExistingAssignmentRow>(
    `SELECT st.id,
            st.subprocess_id,
            st.technique_id,
            st.tech_user_id,
            st.scheduled_date::text,
            st.duration_minutes,
            ts.code AS status
     FROM subprocess_techniques st
     INNER JOIN technique_statuses ts ON ts.id = st.status
     WHERE st.subprocess_id = $1
       AND st.id = $2
     LIMIT 1`,
    [subprocessId, assignmentId]
  );

  return rows.rows[0] ?? null;
};

router.get('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = parseId(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!id) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const rows = await pool.query<SubprocessRow>(
    'SELECT id, process_id, name, description FROM subprocesses WHERE id = $1',
    [id]
  );

  if (rows.rows.length === 0) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  res.json({ subprocess: rows.rows[0] });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = parseId(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!id) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const parsed = subprocessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, description } = parsed.data;

  const result = await pool.query('UPDATE subprocesses SET name = $1, description = $2 WHERE id = $3', [
    name,
    description ?? null,
    id
  ]);

  if (result.rowCount === 0) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  res.json({ message: 'Subprocess updated' });
});

router.get('/:id/techniques', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const id = parseId(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!id) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(id, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const assignmentsResult = await pool.query<SubprocessTechniqueRow>(
    `SELECT st.id,
            st.subprocess_id,
            st.technique_id,
            st.tech_user_id,
            st.scheduled_date::text,
            st.duration_minutes,
            ts.code AS status,
            t.name,
            t.description,
            tu.name AS tech_user_name,
            tu.email AS tech_user_email
     FROM subprocess_techniques st
     INNER JOIN techniques t ON t.id = st.technique_id
     INNER JOIN technique_statuses ts ON ts.id = st.status
     LEFT JOIN users tu ON tu.id = st.tech_user_id
     WHERE st.subprocess_id = $1
     ORDER BY st.id DESC`,
    [id]
  );

  const assignmentIds = assignmentsResult.rows.map((row) => row.id);
  const stakeholdersMap = new Map<
    number,
    Array<{ id: number; name: string | null; email: string | null }>
  >();

  if (assignmentIds.length > 0) {
    const stakeholderRows = await pool.query<StakeholderAssignmentRow>(
      `SELECT ts.subprocess_technique_id AS assignment_id,
              ts.stakeholder_user_id,
              u.name AS stakeholder_name,
              u.email AS stakeholder_email
       FROM technique_stakeholders ts
       INNER JOIN users u ON u.id = ts.stakeholder_user_id
       WHERE ts.subprocess_technique_id = ANY($1::int[])
       ORDER BY ts.subprocess_technique_id, ts.stakeholder_user_id`,
      [assignmentIds]
    );

    for (const row of stakeholderRows.rows) {
      if (!stakeholdersMap.has(row.assignment_id)) {
        stakeholdersMap.set(row.assignment_id, []);
      }
      stakeholdersMap.get(row.assignment_id)?.push({
        id: row.stakeholder_user_id,
        name: row.stakeholder_name,
        email: row.stakeholder_email
      });
    }
  }

  res.json({
    techniques: assignmentsResult.rows.map((row) => ({
      ...row,
      status: row.status.toUpperCase() as 'PLANNED' | 'DONE' | 'CANCELLED',
      stakeholders: stakeholdersMap.get(row.id) ?? []
    }))
  });
});

router.post('/:id/techniques', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId) {
    res.status(400).json({ message: 'Invalid subprocess id' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const parsed = assignTechniqueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const {
    technique_id,
    tech_user_id = null,
    stakeholder_user_ids,
    scheduled_date,
    duration_minutes = null,
    status = 'PLANNED'
  } = parsed.data;

  const normalizedStakeholders = normalizeUserIds(stakeholder_user_ids);
  const normalizedDate = normalizeScheduledDate(scheduled_date);
  if (normalizedDate === 'INVALID_DATE') {
    res.status(400).json({ message: 'Invalid scheduled_date format' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const context = await getSubprocessContext(subprocessId, client);
    if (!context) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Subprocess not found' });
      return;
    }

    const techniqueRows = await client.query<TechniqueRow>('SELECT id FROM techniques WHERE id = $1', [technique_id]);
    if (techniqueRows.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Technique not found' });
      return;
    }

    const existingRows = await client.query(
      'SELECT id FROM subprocess_techniques WHERE subprocess_id = $1 AND technique_id = $2 LIMIT 1',
      [subprocessId, technique_id]
    );
    if (existingRows.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Technique already assigned to subprocess' });
      return;
    }

    const isTechMemberValid = await validateTechMemberInProject(context.project_id, tech_user_id, client);
    if (!isTechMemberValid) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Selected technical user is not assigned to this project' });
      return;
    }

    const areStakeholdersValid = await validateStakeholdersInProject(
      context.project_id,
      normalizedStakeholders,
      client
    );
    if (!areStakeholdersValid) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some stakeholders are not assigned to this project' });
      return;
    }

    const statusId = await getTechniqueStatusIdByCode(status, client);
    if (!statusId) {
      await client.query('ROLLBACK');
      res.status(500).json({ message: `Catalog technique_statuses missing ${status} code` });
      return;
    }

    const result = await client.query<{ id: number }>(
      `INSERT INTO subprocess_techniques
       (subprocess_id, technique_id, tech_user_id, scheduled_date, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [subprocessId, technique_id, tech_user_id, normalizedDate, duration_minutes, statusId]
    );
    const assignmentId = result.rows[0].id;

    for (const stakeholderId of normalizedStakeholders) {
      await client.query(
        `INSERT INTO technique_stakeholders (subprocess_technique_id, stakeholder_user_id)
         VALUES ($1, $2)
         ON CONFLICT (subprocess_technique_id, stakeholder_user_id) DO NOTHING`,
        [assignmentId, stakeholderId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: assignmentId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.put('/:id/techniques/:assignmentId', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  const assignmentId = parseId(req.params.assignmentId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId || !assignmentId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const parsed = updateTechniqueAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const context = await getSubprocessContext(subprocessId, client);
    if (!context) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Subprocess not found' });
      return;
    }

    const existingAssignment = await getTechniqueAssignmentById(subprocessId, assignmentId, client);
    if (!existingAssignment) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Technique assignment not found' });
      return;
    }

    if (existingAssignment.status.toUpperCase() === 'DONE') {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Completed assignments cannot be edited' });
      return;
    }

    const techniqueId = parsed.data.technique_id ?? existingAssignment.technique_id;
    const techUserId =
      parsed.data.tech_user_id !== undefined ? parsed.data.tech_user_id : existingAssignment.tech_user_id;
    const scheduledDate =
      parsed.data.scheduled_date !== undefined ? parsed.data.scheduled_date : existingAssignment.scheduled_date;
    const durationMinutes =
      parsed.data.duration_minutes !== undefined
        ? parsed.data.duration_minutes
        : existingAssignment.duration_minutes;
    const statusCode = parsed.data.status ?? (existingAssignment.status.toUpperCase() as 'PLANNED' | 'DONE' | 'CANCELLED');
    const stakeholderIds = parsed.data.stakeholder_user_ids
      ? normalizeUserIds(parsed.data.stakeholder_user_ids)
      : null;

    const normalizedDate = normalizeScheduledDate(scheduledDate);
    if (normalizedDate === 'INVALID_DATE') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Invalid scheduled_date format' });
      return;
    }

    const techniqueRows = await client.query<TechniqueRow>('SELECT id FROM techniques WHERE id = $1', [techniqueId]);
    if (techniqueRows.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Technique not found' });
      return;
    }

    const duplicateRows = await client.query(
      `SELECT id FROM subprocess_techniques
       WHERE subprocess_id = $1
         AND technique_id = $2
         AND id <> $3
       LIMIT 1`,
      [subprocessId, techniqueId, assignmentId]
    );
    if (duplicateRows.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Technique already assigned to subprocess' });
      return;
    }

    const isTechMemberValid = await validateTechMemberInProject(context.project_id, techUserId ?? null, client);
    if (!isTechMemberValid) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Selected technical user is not assigned to this project' });
      return;
    }

    if (stakeholderIds) {
      const areStakeholdersValid = await validateStakeholdersInProject(context.project_id, stakeholderIds, client);
      if (!areStakeholdersValid) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: 'Some stakeholders are not assigned to this project' });
        return;
      }
    }

    const statusId = await getTechniqueStatusIdByCode(statusCode, client);
    if (!statusId) {
      await client.query('ROLLBACK');
      res.status(500).json({ message: `Catalog technique_statuses missing ${statusCode} code` });
      return;
    }

    await client.query(
      `UPDATE subprocess_techniques
       SET technique_id = $1,
           tech_user_id = $2,
           scheduled_date = $3,
           duration_minutes = $4,
           status = $5
       WHERE id = $6
         AND subprocess_id = $7`,
      [techniqueId, techUserId ?? null, normalizedDate, durationMinutes ?? null, statusId, assignmentId, subprocessId]
    );

    if (stakeholderIds) {
      await client.query('DELETE FROM technique_stakeholders WHERE subprocess_technique_id = $1', [assignmentId]);

      for (const stakeholderId of stakeholderIds) {
        await client.query(
          `INSERT INTO technique_stakeholders (subprocess_technique_id, stakeholder_user_id)
           VALUES ($1, $2)
           ON CONFLICT (subprocess_technique_id, stakeholder_user_id) DO NOTHING`,
          [assignmentId, stakeholderId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Technique assignment updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/:id/techniques/:assignmentId/cancel', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  const assignmentId = parseId(req.params.assignmentId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId || !assignmentId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const existingAssignment = await getTechniqueAssignmentById(subprocessId, assignmentId);
  if (!existingAssignment) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  if (existingAssignment.status.toUpperCase() === 'DONE') {
    res.status(409).json({ message: 'Completed assignments cannot be cancelled' });
    return;
  }

  const cancelledStatusId = await getTechniqueStatusIdByCode('CANCELLED');
  if (!cancelledStatusId) {
    res.status(500).json({ message: 'Catalog technique_statuses missing CANCELLED code' });
    return;
  }

  await pool.query(
    `UPDATE subprocess_techniques
     SET status = $1
     WHERE id = $2
       AND subprocess_id = $3`,
    [cancelledStatusId, assignmentId, subprocessId]
  );

  res.json({ message: 'Technique assignment cancelled' });
});

router.delete('/:id/techniques/:assignmentId', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  const assignmentId = parseId(req.params.assignmentId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId || !assignmentId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const existingAssignment = await getTechniqueAssignmentById(subprocessId, assignmentId);
  if (!existingAssignment) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  if (existingAssignment.status.toUpperCase() === 'DONE') {
    res.status(409).json({ message: 'Completed assignments cannot be deleted' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM technique_stakeholders WHERE subprocess_technique_id = $1', [assignmentId]);
    await client.query('DELETE FROM subprocess_techniques WHERE id = $1 AND subprocess_id = $2', [
      assignmentId,
      subprocessId
    ]);
    await client.query('COMMIT');
    res.json({ message: 'Technique assignment deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

export default router;
