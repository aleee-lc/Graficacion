import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requestOpenRouterStructured } from '../lib/openrouter';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const parseId = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');

const wordsCount = (value: string) => normalizeText(value).split(/\s+/).filter(Boolean).length;

const buildRequirementCode = async (projectId: number, db: Pick<typeof pool, 'query'> = pool) => {
  const rows = await db.query<{ next_number: number }>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next_number
     FROM trace_requirements
     WHERE project_id = $1
       AND code ~ '^REQ-[0-9]+$'`,
    [projectId]
  );
  const nextNumber = rows.rows[0]?.next_number ?? 1;
  return `REQ-${String(nextNumber).padStart(3, '0')}`;
};

const buildDedupeKey = (statement: string) => {
  const normalized = normalizeText(statement).toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return `ai:${hash.toString(16).padStart(8, '0')}`;
};

const hasProjectAccess = async (projectId: number, userId: number) => {
  const rows = await pool.query(
    'SELECT 1 FROM project_users WHERE project_id = $1 AND user_id = $2 LIMIT 1',
    [projectId, userId]
  );
  return rows.rows.length > 0;
};

const findingDraftStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
const requirementDraftStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

const draftFindingsRequestSchema = z.object({
  session_ids: z.array(z.number().int().positive()).min(1).max(30).optional(),
  max_drafts: z.number().int().min(1).max(25).optional().default(8),
  prompt_version: z.string().min(1).max(50).optional().default('v1')
});

const draftRequirementsRequestSchema = z.object({
  finding_ids: z.array(z.number().int().positive()).min(1).max(100),
  max_drafts: z.number().int().min(1).max(25).optional().default(8),
  prompt_version: z.string().min(1).max(50).optional().default('v1')
});

const draftQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']).optional()
});

const updateDraftFindingSchema = z
  .object({
    status: findingDraftStatusSchema.optional(),
    category: z.enum(['problem', 'need', 'constraint']).optional(),
    statement: z.string().min(20).max(4000).optional(),
    review_notes: z.string().max(2000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.status === undefined &&
      value.category === undefined &&
      value.statement === undefined &&
      value.review_notes === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required'
      });
    }

    if (typeof value.statement === 'string' && wordsCount(value.statement) < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statement must contain at least 4 words',
        path: ['statement']
      });
    }
  });

const updateDraftRequirementSchema = z
  .object({
    status: requirementDraftStatusSchema.optional(),
    type: z.enum(['functional', 'non_functional']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    description: z.string().min(12).max(4000).optional(),
    acceptance_criteria: z.string().min(12).max(4000).optional(),
    source_finding_ids: z.array(z.number().int().positive()).min(1).optional(),
    review_notes: z.string().max(2000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.status === undefined &&
      value.type === undefined &&
      value.priority === undefined &&
      value.description === undefined &&
      value.acceptance_criteria === undefined &&
      value.source_finding_ids === undefined &&
      value.review_notes === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required'
      });
    }
  });

const aiFindingOutputSchema = z
  .object({
    drafts: z
      .array(
        z.object({
          session_id: z.number().int().positive(),
          source_evidence_ids: z.array(z.number().int().positive()).min(1),
          category: z.enum(['problem', 'need', 'constraint']),
          statement: z.string().min(20).max(4000),
          confidence: z.number().min(0).max(1).optional()
        })
      )
      .min(1)
      .max(25)
  })
  .superRefine((value, ctx) => {
    value.drafts.forEach((draft, index) => {
      if (wordsCount(draft.statement) < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'statement must contain at least 4 words',
          path: ['drafts', index, 'statement']
        });
      }
    });
  });

const aiRequirementOutputSchema = z.object({
  drafts: z
    .array(
      z.object({
        type: z.enum(['functional', 'non_functional']),
        priority: z.enum(['low', 'medium', 'high', 'critical']),
        description: z.string().min(12).max(4000),
        acceptance_criteria: z.string().min(12).max(4000),
        finding_ids: z.array(z.number().int().positive()).min(1),
        confidence: z.number().min(0).max(1).optional()
      })
    )
    .min(1)
    .max(25)
});

type SessionWithEvidenceRow = {
  id: number;
  title: string;
  technique: string;
  notes: string | null;
  occurred_at: string;
};

type EvidenceRow = {
  id: number;
  session_id: number;
  kind: 'file' | 'note' | 'audio' | 'transcript';
  file_name: string | null;
  mime_type: string | null;
  notes: string | null;
  created_at: string;
};

type FindingContextRow = {
  id: number;
  session_id: number;
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  session_title: string;
  session_technique: string;
  occurred_at: string;
};

type DraftFindingRow = {
  id: number;
  project_id: number;
  source_session_id: number;
  source_evidence_ids: number[];
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  ai_model: string;
  prompt_version: string;
  created_by_user_id: number;
  reviewed_by_user_id: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type DraftRequirementRow = {
  id: number;
  project_id: number;
  source_finding_ids: number[];
  type: 'functional' | 'non_functional';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  acceptance_criteria: string;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  ai_model: string;
  prompt_version: string;
  created_by_user_id: number;
  reviewed_by_user_id: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const formatFindingContext = (sessions: SessionWithEvidenceRow[], evidences: EvidenceRow[]) => {
  const evidenceBySession = new Map<number, EvidenceRow[]>();
  for (const evidence of evidences) {
    evidenceBySession.set(evidence.session_id, [...(evidenceBySession.get(evidence.session_id) ?? []), evidence]);
  }

  return sessions
    .map((session) => {
      const lines: string[] = [];
      lines.push(`Session #${session.id}`);
      lines.push(`Title: ${session.title}`);
      lines.push(`Technique: ${session.technique}`);
      lines.push(`OccurredAt: ${session.occurred_at}`);
      if (session.notes) {
        lines.push(`SessionNotes: ${session.notes.slice(0, 700)}`);
      }
      const sessionEvidences = evidenceBySession.get(session.id) ?? [];
      for (const evidence of sessionEvidences.slice(0, 8)) {
        lines.push(
          `Evidence #${evidence.id} (${evidence.kind}) file=${evidence.file_name ?? '-'} mime=${evidence.mime_type ?? '-'}`
        );
        if (evidence.notes) {
          lines.push(`EvidenceNotes: ${evidence.notes.slice(0, 700)}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
};

const formatRequirementContext = (findings: FindingContextRow[]) =>
  findings
    .map((finding) =>
      [
        `Finding #${finding.id}`,
        `Category: ${finding.category}`,
        `Statement: ${finding.statement.slice(0, 1000)}`,
        `Session: #${finding.session_id} ${finding.session_title}`,
        `Technique: ${finding.session_technique}`,
        `OccurredAt: ${finding.occurred_at}`
      ].join('\n')
    )
    .join('\n\n---\n\n');

const mapDraftFindingRow = (row: DraftFindingRow) => ({
  ...row,
  source_evidence_ids: row.source_evidence_ids ?? []
});

const mapDraftRequirementRow = (row: DraftRequirementRow) => ({
  ...row,
  source_finding_ids: row.source_finding_ids ?? []
});

router.get('/:id/ai/draft-findings', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsedQuery = draftQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    res.status(400).json({ message: 'Invalid query params', errors: parsedQuery.error.flatten().fieldErrors });
    return;
  }

  const rows = await pool.query<DraftFindingRow>(
    `SELECT id,
            project_id,
            source_session_id,
            source_evidence_ids,
            category,
            statement,
            confidence,
            status,
            ai_model,
            prompt_version,
            created_by_user_id,
            reviewed_by_user_id,
            review_notes,
            reviewed_at::text,
            created_at::text
     FROM trace_ai_draft_findings
     WHERE project_id = $1
       AND ($2::text IS NULL OR status = $2)
     ORDER BY id DESC`,
    [projectId, parsedQuery.data.status ?? null]
  );

  res.json({ drafts: rows.rows.map(mapDraftFindingRow) });
});

router.get('/:id/ai/draft-requirements', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsedQuery = draftQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    res.status(400).json({ message: 'Invalid query params', errors: parsedQuery.error.flatten().fieldErrors });
    return;
  }

  const rows = await pool.query<DraftRequirementRow>(
    `SELECT id,
            project_id,
            source_finding_ids,
            type,
            priority,
            description,
            acceptance_criteria,
            confidence,
            status,
            ai_model,
            prompt_version,
            created_by_user_id,
            reviewed_by_user_id,
            review_notes,
            reviewed_at::text,
            created_at::text
     FROM trace_ai_draft_requirements
     WHERE project_id = $1
       AND ($2::text IS NULL OR status = $2)
     ORDER BY id DESC`,
    [projectId, parsedQuery.data.status ?? null]
  );

  res.json({ drafts: rows.rows.map(mapDraftRequirementRow) });
});

router.post('/:id/ai/draft-findings', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = draftFindingsRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const requestedSessionIds =
    parsed.data.session_ids && parsed.data.session_ids.length > 0
      ? Array.from(new Set(parsed.data.session_ids))
      : null;

  const sessions = await pool.query<SessionWithEvidenceRow>(
    `SELECT s.id, s.title, s.technique, s.notes, s.occurred_at::text
     FROM trace_sessions s
     WHERE s.project_id = $1
       AND ($2::int[] IS NULL OR s.id = ANY($2))
       AND EXISTS (
         SELECT 1
         FROM trace_evidences e
         WHERE e.session_id = s.id
       )
     ORDER BY s.occurred_at DESC, s.id DESC
     LIMIT 20`,
    [projectId, requestedSessionIds]
  );

  if (sessions.rows.length === 0) {
    res.status(400).json({
      message: 'No sessions with evidence were found to generate AI finding drafts.'
    });
    return;
  }

  const sessionIds = sessions.rows.map((session) => session.id);
  const evidences = await pool.query<EvidenceRow>(
    `SELECT id, session_id, kind, file_name, mime_type, notes, created_at::text
     FROM trace_evidences
     WHERE session_id = ANY($1::int[])
     ORDER BY id ASC`,
    [sessionIds]
  );

  const evidenceIdsBySession = new Map<number, Set<number>>();
  for (const evidence of evidences.rows) {
    evidenceIdsBySession.set(evidence.session_id, new Set([...(evidenceIdsBySession.get(evidence.session_id) ?? []), evidence.id]));
  }

  const promptContext = formatFindingContext(sessions.rows, evidences.rows);
  const requestedDrafts = parsed.data.max_drafts;

  try {
    const aiResponse = await requestOpenRouterStructured({
      schema: aiFindingOutputSchema,
      messages: [
        {
          role: 'system',
          content:
            'Eres analista senior de requisitos. Responde UNICAMENTE JSON valido. Genera hallazgos en ESPANOL, claros, accionables y basados estrictamente en las sesiones y evidencias proporcionadas. No escribas en ingles.'
        },
        {
          role: 'user',
          content: [
            `Project ID: ${projectId}`,
            `Prompt version: ${parsed.data.prompt_version}`,
            `Genera hasta ${requestedDrafts} borradores de hallazgo.`,
            'Categorias permitidas: problem, need, constraint.',
            'Cada statement debe estar en ESPANOL, ser claro, verificable y tener minimo 20 caracteres y 4 palabras.',
            'Formato JSON obligatorio:',
            '{"drafts":[{"session_id":number,"source_evidence_ids":[number],"category":"problem|need|constraint","statement":"string","confidence":0..1}]}',
            'Usa solamente session_id y evidence ids que existan en el contexto.',
            'Contexto:',
            promptContext
          ].join('\n\n')
        }
      ]
    });

    const allowedSessionIds = new Set(sessionIds);
    const acceptedDrafts = aiResponse.data.drafts
      .filter((draft) => allowedSessionIds.has(draft.session_id))
      .map((draft) => ({
        ...draft,
        statement: normalizeText(draft.statement),
        source_evidence_ids: Array.from(new Set(draft.source_evidence_ids)).filter((evidenceId) =>
          evidenceIdsBySession.get(draft.session_id)?.has(evidenceId)
        )
      }))
      .map((draft) => {
        const allowedEvidenceIds = evidenceIdsBySession.get(draft.session_id);
        return {
          ...draft,
          source_evidence_ids:
            draft.source_evidence_ids.length > 0 ? draft.source_evidence_ids : Array.from(allowedEvidenceIds ?? [])
        };
      })
      .filter((draft) => draft.source_evidence_ids.length > 0)
      .slice(0, requestedDrafts);

    if (acceptedDrafts.length === 0) {
      res.status(422).json({
        message: 'AI did not return valid finding drafts for this project context.'
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created: DraftFindingRow[] = [];

      for (const draft of acceptedDrafts) {
        const result = await client.query<DraftFindingRow>(
          `INSERT INTO trace_ai_draft_findings (
            project_id,
            source_session_id,
            source_evidence_ids,
            category,
            statement,
            confidence,
            status,
            ai_model,
            prompt_version,
            created_by_user_id,
            raw_payload
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10::jsonb)
          RETURNING id,
                    project_id,
                    source_session_id,
                    source_evidence_ids,
                    category,
                    statement,
                    confidence,
                    status,
                    ai_model,
                    prompt_version,
                    created_by_user_id,
                    reviewed_by_user_id,
                    review_notes,
                    reviewed_at::text,
                    created_at::text`,
          [
            projectId,
            draft.session_id,
            draft.source_evidence_ids,
            draft.category,
            draft.statement,
            draft.confidence ?? null,
            aiResponse.model,
            parsed.data.prompt_version,
            userId,
            JSON.stringify(draft)
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({
        drafts: created.map(mapDraftFindingRow),
        generated_count: created.length,
        model: aiResponse.model,
        prompt_version: parsed.data.prompt_version
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed';
    if (
      message.includes('OPENROUTER_API_KEY') ||
      message.includes('OpenRouter request failed') ||
      message.includes('OpenRouter response')
    ) {
      res.status(502).json({ message });
      return;
    }
    throw error;
  }
});

router.post('/:id/ai/draft-requirements', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId) {
    res.status(400).json({ message: 'Invalid project id' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = draftRequirementsRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const requestedFindingIds = Array.from(new Set(parsed.data.finding_ids));
  const findings = await pool.query<FindingContextRow>(
    `SELECT f.id,
            f.session_id,
            f.category,
            f.statement,
            s.title AS session_title,
            s.technique AS session_technique,
            s.occurred_at::text
     FROM trace_findings f
     INNER JOIN trace_sessions s ON s.id = f.session_id
     WHERE s.project_id = $1
       AND f.id = ANY($2::int[])
     ORDER BY f.id DESC`,
    [projectId, requestedFindingIds]
  );

  if (findings.rows.length !== requestedFindingIds.length) {
    res.status(400).json({
      message: 'All finding_ids must belong to this project.'
    });
    return;
  }

  const promptContext = formatRequirementContext(findings.rows);
  const requestedDrafts = parsed.data.max_drafts;

  try {
    const aiResponse = await requestOpenRouterStructured({
      schema: aiRequirementOutputSchema,
      messages: [
        {
          role: 'system',
          content:
            'Eres analista senior de sistemas. Responde UNICAMENTE JSON valido. Genera requisitos en ESPANOL a partir de los hallazgos proporcionados. No escribas en ingles.'
        },
        {
          role: 'user',
          content: [
            `Project ID: ${projectId}`,
            `Prompt version: ${parsed.data.prompt_version}`,
            `Genera hasta ${requestedDrafts} borradores de requisito.`,
            'Cada borrador debe mapearse a uno o mas finding_ids permitidos.',
            `Allowed finding_ids: [${requestedFindingIds.join(', ')}]`,
            'Formato JSON obligatorio:',
            '{"drafts":[{"type":"functional|non_functional","priority":"low|medium|high|critical","description":"string","acceptance_criteria":"string","finding_ids":[number],"confidence":0..1}]}',
            'description y acceptance_criteria deben estar en ESPANOL, ser claros y verificables.',
            'Contexto:',
            promptContext
          ].join('\n\n')
        }
      ]
    });

    const allowedFindingIds = new Set(requestedFindingIds);
    const acceptedDrafts = aiResponse.data.drafts
      .map((draft) => ({
        ...draft,
        description: normalizeText(draft.description),
        acceptance_criteria: normalizeText(draft.acceptance_criteria),
        finding_ids: Array.from(new Set(draft.finding_ids))
      }))
      .filter((draft) => draft.finding_ids.length > 0 && draft.finding_ids.every((id) => allowedFindingIds.has(id)))
      .slice(0, requestedDrafts);

    if (acceptedDrafts.length === 0) {
      res.status(422).json({
        message: 'AI did not return valid requirement drafts for the provided findings.'
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created: DraftRequirementRow[] = [];

      for (const draft of acceptedDrafts) {
        const result = await client.query<DraftRequirementRow>(
          `INSERT INTO trace_ai_draft_requirements (
            project_id,
            source_finding_ids,
            type,
            priority,
            description,
            acceptance_criteria,
            confidence,
            status,
            ai_model,
            prompt_version,
            created_by_user_id,
            raw_payload
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11::jsonb)
          RETURNING id,
                    project_id,
                    source_finding_ids,
                    type,
                    priority,
                    description,
                    acceptance_criteria,
                    confidence,
                    status,
                    ai_model,
                    prompt_version,
                    created_by_user_id,
                    reviewed_by_user_id,
                    review_notes,
                    reviewed_at::text,
                    created_at::text`,
          [
            projectId,
            draft.finding_ids,
            draft.type,
            draft.priority,
            draft.description,
            draft.acceptance_criteria,
            draft.confidence ?? null,
            aiResponse.model,
            parsed.data.prompt_version,
            userId,
            JSON.stringify(draft)
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({
        drafts: created.map(mapDraftRequirementRow),
        generated_count: created.length,
        model: aiResponse.model,
        prompt_version: parsed.data.prompt_version
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed';
    if (
      message.includes('OPENROUTER_API_KEY') ||
      message.includes('OpenRouter request failed') ||
      message.includes('OpenRouter response')
    ) {
      res.status(502).json({ message });
      return;
    }
    throw error;
  }
});

router.patch('/:id/ai/draft-findings/:draftId', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);
  const draftId = parseId(req.params.draftId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId || !draftId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = updateDraftFindingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let parameterIndex = 1;
  const push = (sql: string, value: unknown) => {
    updates.push(`${sql} = $${parameterIndex}`);
    values.push(value);
    parameterIndex += 1;
  };

  if (parsed.data.status !== undefined) {
    push('status', parsed.data.status);
  }
  if (parsed.data.category !== undefined) {
    push('category', parsed.data.category);
  }
  if (parsed.data.statement !== undefined) {
    push('statement', normalizeText(parsed.data.statement));
  }
  if (parsed.data.review_notes !== undefined) {
    push('review_notes', parsed.data.review_notes);
  }

  if (parsed.data.status !== undefined) {
    if (parsed.data.status === 'pending') {
      updates.push('reviewed_at = NULL');
      updates.push('reviewed_by_user_id = NULL');
    } else {
      updates.push('reviewed_at = NOW()');
      push('reviewed_by_user_id', userId);
    }
  }

  const result = await pool.query<DraftFindingRow>(
    `UPDATE trace_ai_draft_findings
     SET ${updates.join(', ')}
     WHERE id = $${parameterIndex}
       AND project_id = $${parameterIndex + 1}
     RETURNING id,
               project_id,
               source_session_id,
               source_evidence_ids,
               category,
               statement,
               confidence,
               status,
               ai_model,
               prompt_version,
               created_by_user_id,
               reviewed_by_user_id,
               review_notes,
               reviewed_at::text,
               created_at::text`,
    [...values, draftId, projectId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ message: 'AI draft finding not found' });
    return;
  }

  if (parsed.data.status === 'accepted') {
    const draft = result.rows[0];
    const dedupeKey = buildDedupeKey(draft.statement);
    const existing = await pool.query<{ id: number }>(
      `SELECT f.id
       FROM trace_findings f
       INNER JOIN trace_sessions s ON s.id = f.session_id
       WHERE s.project_id = $1
         AND f.dedupe_key = $2
       LIMIT 1`,
      [projectId, dedupeKey]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO trace_findings (session_id, category, statement, dedupe_key)
         VALUES ($1, $2, $3, $4)`,
        [draft.source_session_id, draft.category, draft.statement, dedupeKey]
      );
    }
  }

  res.json({ draft: mapDraftFindingRow(result.rows[0]) });
});

router.patch('/:id/ai/draft-requirements/:draftId', async (req: AuthRequest, res) => {
  const userId = req.user?.sub;
  const projectId = parseId(req.params.id);
  const draftId = parseId(req.params.draftId);

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!projectId || !draftId) {
    res.status(400).json({ message: 'Invalid route params' });
    return;
  }

  const hasAccess = await hasProjectAccess(projectId, userId);
  if (!hasAccess) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const parsed = updateDraftRequirementSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  if (parsed.data.source_finding_ids) {
    const uniqueFindingIds = Array.from(new Set(parsed.data.source_finding_ids));
    const findingRows = await pool.query<{ id: number }>(
      `SELECT f.id
       FROM trace_findings f
       INNER JOIN trace_sessions s ON s.id = f.session_id
       WHERE s.project_id = $1
         AND f.id = ANY($2::int[])`,
      [projectId, uniqueFindingIds]
    );

    if (findingRows.rows.length !== uniqueFindingIds.length) {
      res.status(400).json({ message: 'source_finding_ids must belong to this project' });
      return;
    }
    parsed.data.source_finding_ids = uniqueFindingIds;
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let parameterIndex = 1;
  const push = (sql: string, value: unknown) => {
    updates.push(`${sql} = $${parameterIndex}`);
    values.push(value);
    parameterIndex += 1;
  };

  if (parsed.data.status !== undefined) {
    push('status', parsed.data.status);
  }
  if (parsed.data.type !== undefined) {
    push('type', parsed.data.type);
  }
  if (parsed.data.priority !== undefined) {
    push('priority', parsed.data.priority);
  }
  if (parsed.data.description !== undefined) {
    push('description', normalizeText(parsed.data.description));
  }
  if (parsed.data.acceptance_criteria !== undefined) {
    push('acceptance_criteria', normalizeText(parsed.data.acceptance_criteria));
  }
  if (parsed.data.source_finding_ids !== undefined) {
    push('source_finding_ids', parsed.data.source_finding_ids);
  }
  if (parsed.data.review_notes !== undefined) {
    push('review_notes', parsed.data.review_notes);
  }

  if (parsed.data.status !== undefined) {
    if (parsed.data.status === 'pending') {
      updates.push('reviewed_at = NULL');
      updates.push('reviewed_by_user_id = NULL');
    } else {
      updates.push('reviewed_at = NOW()');
      push('reviewed_by_user_id', userId);
    }
  }

  const result = await pool.query<DraftRequirementRow>(
    `UPDATE trace_ai_draft_requirements
     SET ${updates.join(', ')}
     WHERE id = $${parameterIndex}
       AND project_id = $${parameterIndex + 1}
     RETURNING id,
               project_id,
               source_finding_ids,
               type,
               priority,
               description,
               acceptance_criteria,
               confidence,
               status,
               ai_model,
               prompt_version,
               created_by_user_id,
               reviewed_by_user_id,
               review_notes,
               reviewed_at::text,
               created_at::text`,
    [...values, draftId, projectId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ message: 'AI draft requirement not found' });
    return;
  }

  res.json({ draft: mapDraftRequirementRow(result.rows[0]) });
});

export default router;
