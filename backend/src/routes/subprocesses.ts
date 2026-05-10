import { randomUUID } from 'crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { getTechniqueStatusIdByCode } from '../db/catalogs';
import { pool } from '../db/pool';
import { getSupabaseStorageClient } from '../lib/supabase-storage';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// DEPRECATED (traceability refactor):
// These subprocess/technique assignment endpoints are legacy ERP-oriented behavior.
// Keep existing consumers working while migrating to traceability core endpoints.
router.use((req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'Warning',
    '299 - "Deprecated endpoint. Migrate to /projects/:id/sessions and traceability flow endpoints."'
  );
  // eslint-disable-next-line no-console
  console.warn(`[DEPRECATED] ${req.method} ${req.originalUrl}`);
  next();
});

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

const evidenceNotesSchema = z.object({
  notes: z.string().max(4000).optional().nullable()
});

const signedUrlRequestSchema = z.object({
  expires_in: z.number().int().min(60).max(3600).optional()
});

const DEFAULT_ALLOWED_EVIDENCE_MIME_TYPES = [
  'audio/*',
  'image/*',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

const MAX_EVIDENCE_FILES_PER_REQUEST = 10;
const effectiveAllowedEvidenceMimeTypes =
  env.EVIDENCE_ALLOWED_MIME.length > 0 ? env.EVIDENCE_ALLOWED_MIME : DEFAULT_ALLOWED_EVIDENCE_MIME_TYPES;
const evidenceMaxSizeBytes = Math.max(1, Math.floor(env.EVIDENCE_MAX_SIZE_MB * 1024 * 1024));
const defaultSignedUrlTtlSeconds = Math.max(60, env.EVIDENCE_SIGNED_URL_TTL_SECONDS);
const evidenceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: evidenceMaxSizeBytes,
    files: MAX_EVIDENCE_FILES_PER_REQUEST
  }
}).fields([
  { name: 'files', maxCount: MAX_EVIDENCE_FILES_PER_REQUEST },
  { name: 'file', maxCount: 1 }
]);

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

type TechniqueAssignmentContextRow = {
  assignment_id: number;
  subprocess_id: number;
  process_id: number;
  project_id: number;
};

type TechniqueEvidenceRow = {
  id: number;
  subprocess_technique_id: number;
  project_id: number;
  uploaded_by_user_id: number;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  bucket: string;
  object_path: string;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
};

type TechniqueEvidenceStorageRow = {
  id: number;
  subprocess_technique_id: number;
  bucket: string;
  object_path: string;
  deleted_at: string | null;
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

const getTechniqueAssignmentContext = async (
  subprocessId: number,
  assignmentId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<TechniqueAssignmentContextRow | null> => {
  const rows = await db.query<TechniqueAssignmentContextRow>(
    `SELECT st.id AS assignment_id,
            st.subprocess_id,
            sp.process_id,
            p.project_id
     FROM subprocess_techniques st
     INNER JOIN subprocesses sp ON sp.id = st.subprocess_id
     INNER JOIN processes p ON p.id = sp.process_id
     WHERE st.subprocess_id = $1
       AND st.id = $2
     LIMIT 1`,
    [subprocessId, assignmentId]
  );

  return rows.rows[0] ?? null;
};

const getTechniqueEvidenceById = async (
  assignmentId: number,
  evidenceId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<TechniqueEvidenceStorageRow | null> => {
  const rows = await db.query<TechniqueEvidenceStorageRow>(
    `SELECT id,
            subprocess_technique_id,
            bucket,
            object_path,
            deleted_at::text
     FROM technique_evidences
     WHERE subprocess_technique_id = $1
       AND id = $2
     LIMIT 1`,
    [assignmentId, evidenceId]
  );

  return rows.rows[0] ?? null;
};

const listTechniqueEvidencesByAssignment = async (
  assignmentId: number,
  db: Pick<typeof pool, 'query'> = pool
) => {
  const rows = await db.query<TechniqueEvidenceRow>(
    `SELECT te.id,
            te.subprocess_technique_id,
            te.project_id,
            te.uploaded_by_user_id,
            u.name AS uploaded_by_name,
            u.email AS uploaded_by_email,
            te.original_name,
            te.mime_type,
            te.size_bytes,
            te.bucket,
            te.object_path,
            te.notes,
            te.created_at::text,
            te.deleted_at::text
     FROM technique_evidences te
     INNER JOIN users u ON u.id = te.uploaded_by_user_id
     WHERE te.subprocess_technique_id = $1
       AND te.deleted_at IS NULL
     ORDER BY te.created_at DESC`,
    [assignmentId]
  );

  return rows.rows;
};

const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isEvidenceMimeTypeAllowed = (mimeType: string) => {
  const normalized = mimeType.trim().toLowerCase();
  return effectiveAllowedEvidenceMimeTypes.some((allowed) => {
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, allowed.length - 1);
      return normalized.startsWith(prefix);
    }

    return normalized === allowed;
  });
};

const sanitizeFileName = (fileName: string) => {
  const normalized = fileName.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const sanitized = normalized
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+/, '');
  const trimmed = sanitized.slice(0, 120);
  return trimmed.length > 0 ? trimmed : 'file';
};

const buildEvidenceObjectPath = (
  projectId: number,
  subprocessId: number,
  assignmentId: number,
  originalName: string
) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = sanitizeFileName(originalName);
  const token = randomUUID().replace(/-/g, '').slice(0, 12);

  return `projects/${projectId}/subprocesses/${subprocessId}/assignments/${assignmentId}/${timestamp}-${token}-${safeName}`;
};

const runEvidenceUpload = (req: AuthRequest, res: Response): Promise<void> =>
  new Promise((resolve, reject) => {
    evidenceUploadMiddleware(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const getUploadedEvidenceFiles = (req: AuthRequest): Express.Multer.File[] => {
  const rawFiles = (
    req as AuthRequest & {
      files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
    }
  ).files;

  if (!rawFiles) {
    return [];
  }

  if (Array.isArray(rawFiles)) {
    return rawFiles;
  }

  return [...(rawFiles.files ?? []), ...(rawFiles.file ?? [])];
};

const ensureEvidenceStorageConfiguration = () => {
  if (!env.SUPABASE_STORAGE_BUCKET) {
    return {
      ok: false as const,
      message: 'SUPABASE_STORAGE_BUCKET is not configured'
    };
  }

  const client = getSupabaseStorageClient();
  if (!client) {
    return {
      ok: false as const,
      message: 'Supabase storage credentials are not configured'
    };
  }

  return {
    ok: true as const,
    client,
    bucket: env.SUPABASE_STORAGE_BUCKET
  };
};

const removeEvidenceObjects = async (objectPaths: string[]) => {
  if (objectPaths.length === 0) {
    return;
  }

  const storage = ensureEvidenceStorageConfiguration();
  if (!storage.ok) {
    return;
  }

  const { error } = await storage.client.storage.from(storage.bucket).remove(objectPaths);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to cleanup evidence objects', error);
  }
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

router.post('/:id/techniques/:assignmentId/evidences', async (req: AuthRequest, res) => {
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
  if (req.user?.userType !== 'TECH') {
    res.status(403).json({ message: 'Only TECH users can upload evidences' });
    return;
  }

  try {
    await runEvidenceUpload(req, res);
  } catch (error) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          message: `Evidence file exceeds max size of ${env.EVIDENCE_MAX_SIZE_MB} MB`
        });
        return;
      }

      res.status(400).json({ message: `Invalid evidence upload payload (${error.code})` });
      return;
    }

    throw error;
  }

  const parsedNotes = evidenceNotesSchema.safeParse({
    notes: normalizeOptionalText((req.body as { notes?: unknown })?.notes)
  });
  if (!parsedNotes.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsedNotes.error.flatten().fieldErrors });
    return;
  }

  const files = getUploadedEvidenceFiles(req);
  if (files.length === 0) {
    res.status(400).json({ message: 'At least one evidence file is required' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const assignmentContext = await getTechniqueAssignmentContext(subprocessId, assignmentId);
  if (!assignmentContext) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  for (const file of files) {
    if (!file.buffer || file.size <= 0) {
      res.status(400).json({ message: `Evidence file "${file.originalname}" is empty` });
      return;
    }
    if (!isEvidenceMimeTypeAllowed(file.mimetype)) {
      res.status(400).json({
        message: `Evidence file "${file.originalname}" has unsupported MIME type (${file.mimetype})`
      });
      return;
    }
  }

  const storage = ensureEvidenceStorageConfiguration();
  if (!storage.ok) {
    res.status(500).json({ message: storage.message });
    return;
  }

  const uploadedEvidence: Array<{
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    objectPath: string;
  }> = [];

  for (const file of files) {
    const objectPath = buildEvidenceObjectPath(
      assignmentContext.project_id,
      subprocessId,
      assignmentId,
      file.originalname
    );

    const { error } = await storage.client.storage.from(storage.bucket).upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

    if (error) {
      await removeEvidenceObjects(uploadedEvidence.map((item) => item.objectPath));
      res.status(502).json({
        message: `Failed to store evidence "${file.originalname}" in Supabase Storage`
      });
      return;
    }

    uploadedEvidence.push({
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      objectPath
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of uploadedEvidence) {
      await client.query(
        `INSERT INTO technique_evidences (
          subprocess_technique_id,
          project_id,
          uploaded_by_user_id,
          original_name,
          mime_type,
          size_bytes,
          bucket,
          object_path,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          assignmentId,
          assignmentContext.project_id,
          userId,
          item.originalName,
          item.mimeType,
          item.sizeBytes,
          storage.bucket,
          item.objectPath,
          parsedNotes.data.notes ?? null
        ]
      );
    }

    await client.query('COMMIT');

    const evidences = await listTechniqueEvidencesByAssignment(assignmentId);
    res.status(201).json({ evidences });
  } catch (error) {
    await client.query('ROLLBACK');
    await removeEvidenceObjects(uploadedEvidence.map((item) => item.objectPath));
    throw error;
  } finally {
    client.release();
  }
});

router.get('/:id/techniques/:assignmentId/evidences', async (req: AuthRequest, res) => {
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

  const assignmentContext = await getTechniqueAssignmentContext(subprocessId, assignmentId);
  if (!assignmentContext) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  const evidences = await listTechniqueEvidencesByAssignment(assignmentId);
  res.json({ evidences });
});

router.post('/:id/techniques/:assignmentId/evidences/:evidenceId/signed-url', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  const assignmentId = parseId(req.params.assignmentId);
  const evidenceId = parseId(req.params.evidenceId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId || !assignmentId || !evidenceId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const assignmentContext = await getTechniqueAssignmentContext(subprocessId, assignmentId);
  if (!assignmentContext) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  const parsed = signedUrlRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const evidence = await getTechniqueEvidenceById(assignmentId, evidenceId);
  if (!evidence || evidence.deleted_at) {
    res.status(404).json({ message: 'Evidence not found' });
    return;
  }

  const expiresIn = parsed.data.expires_in ?? defaultSignedUrlTtlSeconds;
  const storage = ensureEvidenceStorageConfiguration();
  if (!storage.ok) {
    res.status(500).json({ message: storage.message });
    return;
  }

  const { data, error } = await storage.client.storage
    .from(evidence.bucket)
    .createSignedUrl(evidence.object_path, expiresIn);

  if (error || !data?.signedUrl) {
    res.status(502).json({ message: 'Failed to create evidence signed URL' });
    return;
  }

  res.json({
    url: data.signedUrl,
    expires_in: expiresIn
  });
});

router.delete('/:id/techniques/:assignmentId/evidences/:evidenceId', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const subprocessId = parseId(req.params.id);
  const assignmentId = parseId(req.params.assignmentId);
  const evidenceId = parseId(req.params.evidenceId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!subprocessId || !assignmentId || !evidenceId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }
  if (req.user?.userType !== 'TECH') {
    res.status(403).json({ message: 'Only TECH users can delete evidences' });
    return;
  }

  const hasAccess = await hasSubprocessAccess(subprocessId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Subprocess not found' });
    return;
  }

  const assignmentContext = await getTechniqueAssignmentContext(subprocessId, assignmentId);
  if (!assignmentContext) {
    res.status(404).json({ message: 'Technique assignment not found' });
    return;
  }

  const evidence = await getTechniqueEvidenceById(assignmentId, evidenceId);
  if (!evidence || evidence.deleted_at) {
    res.status(404).json({ message: 'Evidence not found' });
    return;
  }

  const storage = ensureEvidenceStorageConfiguration();
  if (!storage.ok) {
    res.status(500).json({ message: storage.message });
    return;
  }

  const removeResult = await storage.client.storage.from(evidence.bucket).remove([evidence.object_path]);
  if (removeResult.error) {
    res.status(502).json({ message: 'Failed to delete evidence from Supabase Storage' });
    return;
  }

  const result = await pool.query(
    `UPDATE technique_evidences
     SET deleted_at = NOW()
     WHERE id = $1
       AND subprocess_technique_id = $2
       AND deleted_at IS NULL`,
    [evidenceId, assignmentId]
  );

  if (!result.rowCount) {
    res.status(409).json({ message: 'Evidence was already deleted' });
    return;
  }

  res.json({ message: 'Evidence deleted' });
});

export default router;
