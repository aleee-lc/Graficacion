import { createHash, randomUUID } from 'crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { getSupabaseStorageClient } from '../lib/supabase-storage';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const evidenceSchema = z
  .object({
    kind: z.enum(['file', 'note', 'transcript', 'audio']).default('note'),
    file_name: z.string().max(512).optional().nullable(),
    mime_type: z.string().max(255).optional().nullable(),
    size_bytes: z.number().int().positive().optional().nullable(),
    notes: z.string().max(4000).optional().nullable()
  })
  .superRefine((value, ctx) => {
    const notes = value.notes?.trim() ?? '';
    if (value.kind === 'note' || value.kind === 'transcript') {
      if (notes.length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'notes must contain at least 20 characters',
          path: ['notes']
        });
      }
    }
  });

const findingSchema = z
  .object({
    category: z.enum(['problem', 'need', 'constraint']),
    statement: z.string().min(20),
    dedupe_key: z.string().max(255).optional().nullable(),
    allow_duplicate: z.boolean().optional().default(false)
  })
  .superRefine((value, ctx) => {
    const words = value.statement
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0);
    if (words.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statement must contain at least 4 words',
        path: ['statement']
      });
    }
  });

const evidenceNotesSchema = z.object({
  notes: z.string().max(4000).optional().nullable()
});

const signedUrlRequestSchema = z.object({
  expires_in: z.number().int().min(60).max(3600).optional()
});

const DEFAULT_ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/*',
  'audio/*',
  'video/*',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream'
];

const MAX_EVIDENCE_FILES_PER_REQUEST = 10;
const effectiveAllowedEvidenceMimeTypes = Array.from(
  new Set([...DEFAULT_ALLOWED_EVIDENCE_MIME_TYPES, ...env.EVIDENCE_ALLOWED_MIME])
);
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

type SessionContextRow = {
  session_id: number;
  project_id: number;
};

type EvidenceRow = {
  id: number;
  session_id: number;
  kind: 'file' | 'note' | 'audio' | 'transcript';
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  bucket: string | null;
  object_path: string | null;
  created_at: string;
};

type EvidenceStorageRow = {
  id: number;
  session_id: number;
  kind: 'file' | 'note' | 'audio' | 'transcript';
  bucket: string | null;
  object_path: string | null;
};

type FindingRow = {
  id: number;
  session_id: number;
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  dedupe_key: string | null;
  created_at: string;
};

type DuplicateFindingRow = {
  id: number;
  statement: string;
  session_id: number;
  session_title: string;
};

const parseId = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeStatement = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const buildDedupeKey = (statement: string, provided?: string | null): string => {
  if (provided && provided.trim().length > 0) {
    return provided.trim().slice(0, 255);
  }

  const normalized = normalizeStatement(statement);
  const digest = createHash('sha1').update(normalized).digest('hex');
  return `auto:${digest.slice(0, 24)}`;
};

const getSessionContext = async (sessionId: number): Promise<SessionContextRow | null> => {
  const rows = await pool.query<SessionContextRow>(
    `SELECT s.id AS session_id, s.project_id
     FROM trace_sessions s
     WHERE s.id = $1
     LIMIT 1`,
    [sessionId]
  );
  return rows.rows[0] ?? null;
};

const hasSessionAccess = async (sessionId: number, userId: number) => {
  const rows = await pool.query(
    `SELECT 1
     FROM trace_sessions s
     INNER JOIN project_users pu ON pu.project_id = s.project_id
     WHERE s.id = $1 AND pu.user_id = $2
     LIMIT 1`,
    [sessionId, userId]
  );
  return rows.rows.length > 0;
};

const hasEvidenceForSession = async (sessionId: number): Promise<boolean> => {
  const rows = await pool.query<{ has_evidence: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM trace_evidences
       WHERE session_id = $1
     ) AS has_evidence`,
    [sessionId]
  );
  return rows.rows[0]?.has_evidence ?? false;
};

const listSessionEvidences = async (
  sessionId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<EvidenceRow[]> => {
  const rows = await db.query<EvidenceRow>(
    `SELECT id,
            session_id,
            kind,
            file_name,
            mime_type,
            size_bytes,
            notes,
            bucket,
            object_path,
            created_at::text
     FROM trace_evidences
     WHERE session_id = $1
     ORDER BY id DESC`,
    [sessionId]
  );
  return rows.rows;
};

const getSessionEvidenceById = async (
  sessionId: number,
  evidenceId: number,
  db: Pick<typeof pool, 'query'> = pool
): Promise<EvidenceStorageRow | null> => {
  const rows = await db.query<EvidenceStorageRow>(
    `SELECT id, session_id, kind, bucket, object_path
     FROM trace_evidences
     WHERE session_id = $1
       AND id = $2
     LIMIT 1`,
    [sessionId, evidenceId]
  );
  return rows.rows[0] ?? null;
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
  if (!normalized) {
    return true;
  }
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

const buildEvidenceObjectPath = (projectId: number, sessionId: number, originalName: string) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = sanitizeFileName(originalName);
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  return `projects/${projectId}/sessions/${sessionId}/${timestamp}-${token}-${safeName}`;
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

router.get('/:id/evidences', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ message: 'Invalid session id' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const evidences = await listSessionEvidences(sessionId);
  res.json({ evidences });
});

router.post('/:id/evidences', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ message: 'Invalid session id' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const parsed = evidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  if (parsed.data.kind === 'file' || parsed.data.kind === 'audio') {
    res.status(400).json({
      message: 'Use /sessions/:id/evidences/upload to upload real files.'
    });
    return;
  }

  const result = await pool.query<EvidenceRow>(
    `INSERT INTO trace_evidences (session_id, kind, notes)
     VALUES ($1, $2, $3)
     RETURNING id,
               session_id,
               kind,
               file_name,
               mime_type,
               size_bytes,
               notes,
               bucket,
               object_path,
               created_at::text`,
    [sessionId, parsed.data.kind, parsed.data.notes?.trim() || null]
  );

  res.status(201).json({ evidence: result.rows[0] });
});

router.post('/:id/evidences/upload', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ message: 'Invalid session id' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
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

  const sessionContext = await getSessionContext(sessionId);
  if (!sessionContext) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const storage = ensureEvidenceStorageConfiguration();
  if (!storage.ok) {
    res.status(500).json({ message: storage.message });
    return;
  }

  const uploadedEvidence: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    objectPath: string;
    kind: 'file' | 'audio';
  }> = [];

  for (const file of files) {
    const objectPath = buildEvidenceObjectPath(sessionContext.project_id, sessionId, file.originalname);
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
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      objectPath,
      kind: file.mimetype.toLowerCase().startsWith('audio/') ? 'audio' : 'file'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of uploadedEvidence) {
      await client.query(
        `INSERT INTO trace_evidences (
          session_id,
          kind,
          file_name,
          mime_type,
          size_bytes,
          notes,
          bucket,
          object_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          item.kind,
          item.fileName,
          item.mimeType,
          item.sizeBytes,
          parsedNotes.data.notes ?? null,
          storage.bucket,
          item.objectPath
        ]
      );
    }

    await client.query('COMMIT');
    const evidences = await listSessionEvidences(sessionId);
    res.status(201).json({ evidences, uploaded_count: uploadedEvidence.length });
  } catch (error) {
    await client.query('ROLLBACK');
    await removeEvidenceObjects(uploadedEvidence.map((item) => item.objectPath));
    throw error;
  } finally {
    client.release();
  }
});

router.post('/:id/evidences/:evidenceId/signed-url', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);
  const evidenceId = parseId(req.params.evidenceId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId || !evidenceId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const parsed = signedUrlRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const evidence = await getSessionEvidenceById(sessionId, evidenceId);
  if (!evidence) {
    res.status(404).json({ message: 'Evidence not found' });
    return;
  }
  if (!evidence.bucket || !evidence.object_path) {
    res.status(400).json({ message: 'Evidence does not have a storage object' });
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

  res.json({ url: data.signedUrl, expires_in: expiresIn });
});

router.get('/:id/findings', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ message: 'Invalid session id' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const rows = await pool.query<FindingRow>(
    `SELECT id,
            session_id,
            category,
            statement,
            dedupe_key,
            created_at::text
     FROM trace_findings
     WHERE session_id = $1
     ORDER BY id DESC`,
    [sessionId]
  );

  res.json({ findings: rows.rows });
});

router.post('/:id/findings', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const sessionId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ message: 'Invalid session id' });
    return;
  }

  const hasAccess = await hasSessionAccess(sessionId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const parsed = findingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const sessionContext = await getSessionContext(sessionId);
  if (!sessionContext) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const hasEvidence = await hasEvidenceForSession(sessionContext.session_id);
  if (!hasEvidence) {
    res.status(400).json({
      message: 'Cannot create finding without evidence. Add at least one evidence to this session first.'
    });
    return;
  }

  const dedupeKey = buildDedupeKey(parsed.data.statement, parsed.data.dedupe_key);
  const duplicateRows = await pool.query<DuplicateFindingRow>(
    `SELECT f.id, f.statement, s.id AS session_id, s.title AS session_title
     FROM trace_findings f
     INNER JOIN trace_sessions s ON s.id = f.session_id
     WHERE s.project_id = $1
       AND f.dedupe_key = $2
     ORDER BY f.id DESC
     LIMIT 1`,
    [sessionContext.project_id, dedupeKey]
  );

  const duplicate = duplicateRows.rows[0] ?? null;
  if (duplicate && !parsed.data.allow_duplicate) {
    res.status(409).json({
      message: 'Possible duplicate finding detected. Confirm allow_duplicate to continue.',
      dedupe_key: dedupeKey,
      duplicate
    });
    return;
  }

  const result = await pool.query<FindingRow>(
    `INSERT INTO trace_findings (session_id, category, statement, dedupe_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id, session_id, category, statement, dedupe_key, created_at::text`,
    [sessionContext.session_id, parsed.data.category, parsed.data.statement.trim(), dedupeKey]
  );

  res.status(201).json({
    finding: result.rows[0],
    duplicate_warning: duplicate
      ? {
          message: 'Finding was saved with duplicate key after explicit confirmation.',
          duplicate
        }
      : null
  });
});

export default router;
