import { randomBytes } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requestOpenRouterStructured } from '../lib/openrouter';
import { discoveryTypeForTechnique, ensureTraceabilityWorkspaceSchema } from '../lib/traceability-workspace-schema';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
const responseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }
}).fields([{ name: 'files', maxCount: 10 }]);

const categorySchema = z.enum(['interview', 'survey', 'observation', 'focus_group', 'document', 'transaction', 'general']);
const responseModeSchema = z.enum(['form', 'audio', 'interview', 'document', 'observation', 'transaction']);
const questionTypeSchema = z.enum([
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'scale_1_5',
  'yes_no',
  'date',
  'number',
  'file'
]);

const questionSchema = z.object({
  id: z.number().int().positive().optional(),
  question_text: z.string().min(3),
  question_type: questionTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).default([]),
  sort_order: z.number().int().min(0).default(0),
  help_text: z.string().optional().nullable()
});

const surveySchema = z.object({
  title: z.string().min(3),
  description: z.string().min(8),
  objective: z.string().optional().nullable(),
  category: categorySchema.default('survey'),
  status: z.enum(['draft', 'active', 'closed']).default('draft'),
  due_at: z.string().optional().nullable(),
  allow_audio: z.boolean().default(false),
  allow_document: z.boolean().default(false),
  allow_anonymous_response: z.boolean().default(true),
  stakeholder_ids: z.array(z.number().int().positive()).default([]),
  questions: z.array(questionSchema).min(1)
});

const answerSchema = z.object({
  question_id: z.number().int().positive(),
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
});

const responseSchema = z.object({
  stakeholder_id: z.number().int().positive().optional().nullable(),
  respondent_name: z.string().optional().nullable(),
  respondent_contact: z.string().optional().nullable(),
  response_mode: responseModeSchema.default('form'),
  notes: z.string().optional().nullable(),
  answers: z.array(answerSchema).default([])
});

const aiQuestionsRequestSchema = z.object({
  title: z.string().max(300).optional().default(''),
  description: z.string().max(1200).optional().default(''),
  objective: z.string().max(1200).optional().default(''),
  prompt: z.string().max(500).optional().default(''),
  count: z.number().int().min(3).max(15).optional().default(8)
}).superRefine((value, ctx) => {
  const text = `${value.title} ${value.description} ${value.objective} ${value.prompt}`.trim();
  if (text.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'title, description, objective or prompt is required'
    });
  }
});

const aiQuestionsOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        question_text: z.string().min(3),
        question_type: questionTypeSchema,
        required: z.boolean().default(true),
        options: z.array(z.string()).default([]),
        rationale: z.string().optional()
      })
    )
    .min(1)
    .max(15)
});

const buildFallbackSurveyQuestions = (input: { title?: string; description?: string; objective?: string; prompt?: string; count: number }) => {
  const sourceText = `${input.title ?? ''} ${input.description ?? ''} ${input.objective ?? ''} ${input.prompt ?? ''}`.toLowerCase();
  const focus = [input.prompt, input.objective, input.title, input.description].find((value) => value && value.trim().length > 0)?.trim() ?? 'el proceso';
  const restaurant = /restaurante|mesa|mesero|cajero|comanda|pedido|cocina|cuenta|propina|menu|menú/.test(sourceText);
  const cashier = /cajero|caja|pago|cuenta|ticket|factura|cobro/.test(sourceText);
  const waiter = /mesero|mesa|comanda|pedido|cliente|orden/.test(sourceText);
  if (restaurant && waiter) {
    return [
      { question_text: 'Cuando tomas una orden, que datos necesitas registrar para evitar errores en cocina?', question_type: 'long_text' as const, required: true, options: [] },
      { question_text: 'En que momento se pierden o confunden con mayor frecuencia las comandas?', question_type: 'single_choice' as const, required: true, options: ['Al tomar la orden', 'Al enviarla a cocina', 'Al modificar platillos', 'Al cerrar la cuenta', 'Otro'] },
      { question_text: 'Como deberia avisarte el sistema cuando cocina marca un platillo como listo?', question_type: 'multiple_choice' as const, required: true, options: ['Notificacion visual', 'Sonido', 'Cambio de color por mesa', 'Lista de pendientes', 'No necesito aviso'] },
      { question_text: 'Que cambios de una orden ocurren mas seguido despues de enviarla a cocina?', question_type: 'long_text' as const, required: true, options: [] },
      { question_text: 'Que tan facil es saber el estado actual de cada mesa?', question_type: 'scale_1_5' as const, required: true, options: [] },
      { question_text: 'Necesitas separar cuentas por persona o producto?', question_type: 'yes_no' as const, required: true, options: [] },
      { question_text: 'Que informacion de una mesa deberia verse de inmediato sin abrir detalle?', question_type: 'long_text' as const, required: true, options: [] },
      { question_text: 'Que error del sistema actual afecta mas la experiencia del cliente?', question_type: 'long_text' as const, required: true, options: [] }
    ].slice(0, input.count).map((question, index) => ({ ...question, sort_order: index }));
  }
  if (restaurant && cashier) {
    return [
      { question_text: 'Que datos necesitas validar antes de cerrar una cuenta?', question_type: 'multiple_choice' as const, required: true, options: ['Mesa', 'Productos consumidos', 'Descuentos', 'Metodo de pago', 'Propina', 'Facturacion'] },
      { question_text: 'Cuales son los problemas mas frecuentes al dividir una cuenta?', question_type: 'long_text' as const, required: true, options: [] },
      { question_text: 'Que metodos de pago deben soportarse y combinarse en una misma cuenta?', question_type: 'multiple_choice' as const, required: true, options: ['Efectivo', 'Tarjeta', 'Transferencia', 'Vales', 'Cortesia', 'Mixto'] },
      { question_text: 'Que tan rapido puedes corregir un cobro equivocado?', question_type: 'scale_1_5' as const, required: true, options: [] },
      { question_text: 'El sistema debe generar factura o ticket fiscal desde caja?', question_type: 'yes_no' as const, required: true, options: [] },
      { question_text: 'Que informacion necesitas para hacer corte de caja sin diferencias?', question_type: 'long_text' as const, required: true, options: [] },
      { question_text: 'En que paso se generan mas filas o espera para el cliente?', question_type: 'single_choice' as const, required: true, options: ['Solicitar cuenta', 'Dividir cuenta', 'Procesar pago', 'Facturar', 'Corregir errores'] },
      { question_text: 'Que reportes diarios necesita caja al finalizar turno?', question_type: 'long_text' as const, required: true, options: [] }
    ].slice(0, input.count).map((question, index) => ({ ...question, sort_order: index }));
  }
  const baseQuestions = [
    {
      question_text: `Describe como realizas actualmente ${focus}.`,
      question_type: 'long_text' as const,
      required: true,
      options: []
    },
    {
      question_text: `Que problemas encuentras con mayor frecuencia en ${focus}?`,
      question_type: 'long_text' as const,
      required: true,
      options: []
    },
    {
      question_text: `Que tan satisfecho estas con el proceso actual?`,
      question_type: 'scale_1_5' as const,
      required: true,
      options: []
    },
    {
      question_text: `En que paso se pierde mas tiempo?`,
      question_type: 'short_text' as const,
      required: false,
      options: []
    },
    {
      question_text: `Que informacion necesitas ver para completar tu trabajo sin errores?`,
      question_type: 'long_text' as const,
      required: true,
      options: []
    },
    {
      question_text: `Que prioridad tendria mejorar este flujo?`,
      question_type: 'single_choice' as const,
      required: true,
      options: ['Baja', 'Media', 'Alta', 'Critica']
    },
    {
      question_text: `Que canales o herramientas usas durante este proceso?`,
      question_type: 'multiple_choice' as const,
      required: false,
      options: ['Sistema actual', 'Excel/hojas de calculo', 'WhatsApp/chat', 'Correo', 'Papel', 'Otro']
    },
    {
      question_text: `Hay errores recurrentes que el sistema deberia prevenir?`,
      question_type: 'yes_no' as const,
      required: true,
      options: []
    },
    {
      question_text: `Que cambio haria mas util el sistema para tu rol?`,
      question_type: 'long_text' as const,
      required: true,
      options: []
    }
  ];
  return baseQuestions.slice(0, input.count).map((question, index) => ({ ...question, sort_order: index }));
};

type SurveyRow = {
  id: number;
  project_id: number;
  title: string;
  description: string;
  objective: string | null;
  category: 'interview' | 'survey' | 'observation' | 'focus_group' | 'document' | 'transaction' | 'general';
  status: 'draft' | 'active' | 'closed';
  allow_audio: boolean;
  allow_document: boolean;
  allow_anonymous_response: boolean;
  share_token: string;
  due_at: string | null;
  trace_session_id: number | null;
  created_at: string;
  updated_at: string;
  response_count: number;
};

type QuestionRow = {
  id: number;
  survey_id: number;
  question_text: string;
  question_type: z.infer<typeof questionTypeSchema>;
  required: boolean;
  options: string[];
  sort_order: number;
  help_text: string | null;
};

type ResponseRow = {
  id: number;
  survey_id: number;
  stakeholder_id: number | null;
  respondent_name: string | null;
  respondent_contact: string | null;
  response_mode: z.infer<typeof responseModeSchema>;
  notes: string | null;
  submitted_at: string;
  trace_session_id: number | null;
  stakeholder_name: string | null;
  stakeholder_role: string | null;
  answers: Array<{ question_id: number; answer: unknown }>;
};

const hasProjectAccess = async (projectId: number, userId: number) => {
  const rows = await pool.query('SELECT 1 FROM project_users WHERE project_id = $1 AND user_id = $2 LIMIT 1', [
    projectId,
    userId
  ]);
  return rows.rows.length > 0;
};

const createShareToken = () => randomBytes(24).toString('hex');

const mapSurvey = (row: SurveyRow) => ({
  ...row,
  response_count: Number(row.response_count ?? 0)
});

let surveySchemaReady = false;

const ensureSurveySchema = async () => {
  if (surveySchemaReady) {
    return;
  }
  await ensureTraceabilityWorkspaceSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_forms (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      objective TEXT,
      category TEXT NOT NULL DEFAULT 'survey',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
      allow_audio BOOLEAN NOT NULL DEFAULT FALSE,
      allow_document BOOLEAN NOT NULL DEFAULT FALSE,
      allow_anonymous_response BOOLEAN NOT NULL DEFAULT TRUE,
      share_token TEXT NOT NULL UNIQUE,
      due_at TIMESTAMPTZ,
      trace_session_id INTEGER REFERENCES trace_sessions(id) ON DELETE SET NULL,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_questions (
      id SERIAL PRIMARY KEY,
      survey_id INTEGER NOT NULL REFERENCES survey_forms(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INTEGER NOT NULL DEFAULT 0,
      help_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_recipients (
      survey_id INTEGER NOT NULL REFERENCES survey_forms(id) ON DELETE CASCADE,
      stakeholder_id INTEGER NOT NULL REFERENCES trace_stakeholders(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (survey_id, stakeholder_id)
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      survey_id INTEGER NOT NULL REFERENCES survey_forms(id) ON DELETE CASCADE,
      stakeholder_id INTEGER REFERENCES trace_stakeholders(id) ON DELETE SET NULL,
      respondent_name TEXT,
      respondent_contact TEXT,
      response_mode TEXT NOT NULL DEFAULT 'form',
      notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trace_session_id INTEGER REFERENCES trace_sessions(id) ON DELETE SET NULL,
      UNIQUE (survey_id, stakeholder_id)
    );

    CREATE TABLE IF NOT EXISTS survey_answers (
      id SERIAL PRIMARY KEY,
      response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
      answer JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (response_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_survey_forms_project ON survey_forms(project_id);
    CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);

    ALTER TABLE survey_forms
      ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'survey',
      ADD COLUMN IF NOT EXISTS allow_audio BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS allow_document BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS allow_anonymous_response BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS trace_session_id INTEGER REFERENCES trace_sessions(id) ON DELETE SET NULL;
    ALTER TABLE survey_forms DROP CONSTRAINT IF EXISTS survey_forms_category_check;
    ALTER TABLE survey_forms ADD CONSTRAINT survey_forms_category_check
      CHECK (category IN ('interview', 'survey', 'observation', 'focus_group', 'document', 'transaction', 'general'));
    ALTER TABLE survey_questions ADD COLUMN IF NOT EXISTS help_text TEXT;
    ALTER TABLE survey_questions DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;
    ALTER TABLE survey_questions ADD CONSTRAINT survey_questions_question_type_check
      CHECK (question_type IN ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'scale_1_5', 'yes_no', 'date', 'number', 'file'));
    ALTER TABLE survey_responses
      ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'form',
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_response_mode_check;
    ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_response_mode_check
      CHECK (response_mode IN ('form', 'audio', 'interview', 'document', 'observation', 'transaction'));
  `);
  surveySchemaReady = true;
};

const getSurveyQuestions = async (surveyId: number) => {
  await ensureSurveySchema();
  const rows = await pool.query<QuestionRow>(
    `SELECT id, survey_id, question_text, question_type, required, options, sort_order, help_text
     FROM survey_questions
     WHERE survey_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [surveyId]
  );
  return rows.rows;
};

const surveySelect = `sf.id,
            sf.project_id,
            sf.title,
            sf.description,
            sf.objective,
            sf.category,
            sf.status,
            sf.allow_audio,
            sf.allow_document,
            sf.allow_anonymous_response,
            sf.share_token,
            sf.due_at::text,
            sf.trace_session_id,
            sf.created_at::text,
            sf.updated_at::text,
            COUNT(sr.id)::int AS response_count`;

const techniqueForCategory = (category: SurveyRow['category']) => {
  const labels: Record<SurveyRow['category'], string> = {
    interview: 'Entrevista',
    survey: 'Cuestionario',
    observation: 'Observacion',
    focus_group: 'Focus Group',
    document: 'Documento',
    transaction: 'Seguimiento Transaccional',
    general: 'Cuestionario'
  };
  return labels[category] ?? 'Cuestionario';
};

const buildSurveySessionNotes = (survey: Pick<SurveyRow, 'description' | 'objective' | 'category'>, questions: QuestionRow[]) =>
  [
    `Instrumento de toma de requisitos: ${techniqueForCategory(survey.category)}`,
    `Descripcion:\n${survey.description}`,
    survey.objective ? `Objetivo:\n${survey.objective}` : '',
    questions.length > 0
      ? `Preguntas:\n${questions
          .map((question, index) => `${index + 1}. ${question.question_text}`)
          .join('\n')}`
      : ''
  ].filter(Boolean).join('\n\n');

const ensureSurveyTraceSession = async (
  client: PoolClient,
  survey: SurveyRow,
  questions: QuestionRow[],
  stakeholderIds: number[] = []
) => {
  if (survey.trace_session_id) {
    return survey.trace_session_id;
  }

  const technique = techniqueForCategory(survey.category);
  const notes = buildSurveySessionNotes(survey, questions);
  const sessionRows = await client.query<{ id: number }>(
    `INSERT INTO trace_sessions (project_id, technique, discovery_type, status, title, notes, occurred_at)
     VALUES ($1, $2, $3, 'planned', $4, $5, NOW())
     RETURNING id`,
    [survey.project_id, technique, discoveryTypeForTechnique(technique), `${technique}: ${survey.title}`, notes]
  );
  const sessionId = sessionRows.rows[0].id;
  await client.query('UPDATE survey_forms SET trace_session_id = $1, updated_at = NOW() WHERE id = $2', [
    sessionId,
    survey.id
  ]);
  if (notes.trim().length > 0) {
    await client.query(`INSERT INTO trace_evidences (session_id, kind, notes) VALUES ($1, 'note', $2)`, [
      sessionId,
      notes
    ]);
  }
  for (const stakeholderId of stakeholderIds) {
    await client.query(
      `INSERT INTO trace_session_stakeholders (session_id, stakeholder_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [sessionId, stakeholderId]
    );
  }
  return sessionId;
};

const responsePayloadFromRequest = (req: any) => {
  if (typeof req.body?.payload === 'string') {
    try {
      return JSON.parse(req.body.payload);
    } catch {
      return req.body;
    }
  }
  return req.body;
};

const uploadedResponseFiles = (req: any): Express.Multer.File[] => {
  const raw = req.files as Record<string, Express.Multer.File[]> | undefined;
  return raw?.files ?? [];
};

router.get('/public/:token', async (req, res) => {
  await ensureSurveySchema();
  const token = req.params.token;
  const surveyRows = await pool.query<SurveyRow>(
    `SELECT ${surveySelect}
     FROM survey_forms sf
     LEFT JOIN survey_responses sr ON sr.survey_id = sf.id
     WHERE sf.share_token = $1
     GROUP BY sf.id`,
    [token]
  );
  const survey = surveyRows.rows[0];
  if (!survey || survey.status !== 'active') {
    res.status(404).json({ message: 'Survey not found or not active' });
    return;
  }
  if (survey.due_at && new Date(survey.due_at).getTime() < Date.now()) {
    res.status(410).json({ message: 'Survey is closed' });
    return;
  }
  const questions = await getSurveyQuestions(survey.id);
  const recipients = await pool.query(
    `SELECT ts.id, ts.name, ts.role
     FROM survey_recipients sr
     INNER JOIN trace_stakeholders ts ON ts.id = sr.stakeholder_id
     WHERE sr.survey_id = $1
     ORDER BY ts.name ASC`,
    [survey.id]
  );
  res.json({ survey: mapSurvey(survey), questions, recipients: recipients.rows });
});

router.post('/public/:token/responses', responseUpload, async (req, res) => {
  await ensureSurveySchema();
  const token = req.params.token;
  const parsed = responseSchema.safeParse(responsePayloadFromRequest(req));
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const surveyRows = await client.query<SurveyRow>(
      `SELECT ${surveySelect}
       FROM survey_forms sf
       LEFT JOIN survey_responses sr ON sr.survey_id = sf.id
       WHERE sf.share_token = $1
       GROUP BY sf.id`,
      [token]
    );
    const survey = surveyRows.rows[0];
    if (!survey || survey.status !== 'active') {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Survey not found or not active' });
      return;
    }

    const questions = await client.query<QuestionRow>(
      `SELECT id, survey_id, question_text, question_type, required, options, sort_order, help_text
       FROM survey_questions
       WHERE survey_id = $1`,
      [survey.id]
    );
    const questionMap = new Map(questions.rows.map((question) => [question.id, question]));
    const answerMap = new Map(parsed.data.answers.map((answer) => [answer.question_id, answer.answer]));
    const missingRequired = questions.rows.find((question) => question.required && !answerMap.has(question.id));
    if (missingRequired) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `Missing answer for required question ${missingRequired.id}` });
      return;
    }
    if (parsed.data.answers.some((answer) => !questionMap.has(answer.question_id))) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some answers do not belong to this survey' });
      return;
    }

    const stakeholderId = parsed.data.stakeholder_id ?? null;
    if (stakeholderId) {
      const recipientRows = await client.query(
        `SELECT 1
         FROM survey_recipients
         WHERE survey_id = $1 AND stakeholder_id = $2
         LIMIT 1`,
        [survey.id, stakeholderId]
      );
      if (recipientRows.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(403).json({ message: 'Stakeholder is not a recipient for this survey' });
        return;
      }
    }

    let responseStakeholderId = stakeholderId;
    if (!responseStakeholderId) {
      const anonymousRows = await client.query<{ id: number }>(
        `INSERT INTO trace_stakeholders (project_id, name, role, type, contact)
         VALUES ($1, $2, 'Respondente de encuesta', 'external', $3)
         RETURNING id`,
        [
          survey.project_id,
          parsed.data.respondent_name?.trim() || 'Respondente anonimo',
          parsed.data.respondent_contact?.trim() || null
        ]
      );
      responseStakeholderId = anonymousRows.rows[0].id;
    }

    const responseRows = await client.query<{ id: number }>(
      `INSERT INTO survey_responses (survey_id, stakeholder_id, respondent_name, respondent_contact, response_mode, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        survey.id,
        responseStakeholderId,
        parsed.data.respondent_name ?? null,
        parsed.data.respondent_contact ?? null,
        parsed.data.response_mode,
        parsed.data.notes ?? null
      ]
    );
    const responseId = responseRows.rows[0].id;
    for (const answer of parsed.data.answers) {
      await client.query(
        `INSERT INTO survey_answers (response_id, question_id, answer)
         VALUES ($1, $2, $3::jsonb)`,
        [responseId, answer.question_id, JSON.stringify(answer.answer)]
      );
    }

    const files = uploadedResponseFiles(req);
    const evidenceText = [
      parsed.data.notes ? `Notas de respuesta:\n${parsed.data.notes}` : '',
      questions.rows
      .map((question) => {
        const value = answerMap.get(question.id);
        return `${question.question_text}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`;
      })
      .join('\n')
    ].filter(Boolean).join('\n\n');
    const sessionId = await ensureSurveyTraceSession(client, survey, questions.rows, [responseStakeholderId]);
    await client.query(
      `INSERT INTO trace_session_stakeholders (session_id, stakeholder_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [sessionId, responseStakeholderId]
    );
    await client.query(
      `INSERT INTO trace_evidences (session_id, kind, notes)
       VALUES ($1, 'note', $2)`,
      [sessionId, evidenceText]
    );
    for (const file of files) {
      await client.query(
        `INSERT INTO trace_evidences (session_id, kind, file_name, mime_type, size_bytes, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sessionId,
          file.mimetype.toLowerCase().startsWith('audio/') ? 'audio' : 'file',
          file.originalname,
          file.mimetype,
          file.size,
          'Archivo adjunto en respuesta de cuestionario'
        ]
      );
    }
    await client.query(
      `UPDATE trace_sessions
          SET status = CASE WHEN status = 'planned' THEN 'in_analysis' ELSE status END
        WHERE id = $1`,
      [sessionId]
    );
    await client.query('UPDATE survey_responses SET trace_session_id = $1 WHERE id = $2', [sessionId, responseId]);

    await client.query('COMMIT');
    res.status(201).json({ response_id: responseId, trace_session_id: sessionId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err?.code === '23505') {
      res.status(409).json({ message: 'This stakeholder already answered the survey' });
      return;
    }
    res.status(500).json({ message: 'Could not submit survey response' });
  } finally {
    client.release();
  }
});

router.use(requireAuth);

router.get('/projects/:projectId/surveys', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const projectId = Number(req.params.projectId);
  const userId = req.user?.sub;
  if (!userId || Number.isNaN(projectId) || !(await hasProjectAccess(projectId, userId))) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }
  const rows = await pool.query<SurveyRow>(
    `SELECT ${surveySelect}
     FROM survey_forms sf
     LEFT JOIN survey_responses sr ON sr.survey_id = sf.id
     WHERE sf.project_id = $1
     GROUP BY sf.id
     ORDER BY sf.created_at DESC`,
    [projectId]
  );
  res.json({ surveys: rows.rows.map(mapSurvey) });
});

router.get('/:surveyId', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const surveyId = Number(req.params.surveyId);
  const userId = req.user?.sub;
  if (!userId || Number.isNaN(surveyId)) {
    res.status(400).json({ message: 'Invalid survey id' });
    return;
  }
  const rows = await pool.query<SurveyRow>(
    `SELECT ${surveySelect}
     FROM survey_forms sf
     LEFT JOIN survey_responses sr ON sr.survey_id = sf.id
     WHERE sf.id = $1
     GROUP BY sf.id`,
    [surveyId]
  );
  const survey = rows.rows[0];
  if (!survey || !(await hasProjectAccess(survey.project_id, userId))) {
    res.status(404).json({ message: 'Survey not found' });
    return;
  }
  const questions = await getSurveyQuestions(survey.id);
  const recipients = await pool.query(
    `SELECT ts.id, ts.name, ts.role
     FROM survey_recipients sr
     INNER JOIN trace_stakeholders ts ON ts.id = sr.stakeholder_id
     WHERE sr.survey_id = $1
     ORDER BY ts.name ASC`,
    [survey.id]
  );
  res.json({ survey: mapSurvey(survey), questions, recipients: recipients.rows });
});

router.post('/projects/:projectId/surveys', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const projectId = Number(req.params.projectId);
  const userId = req.user?.sub;
  if (!userId || Number.isNaN(projectId) || !(await hasProjectAccess(projectId, userId))) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }
  const parsed = surveySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stakeholderIds = Array.from(new Set(parsed.data.stakeholder_ids));
    if (stakeholderIds.length > 0) {
      const rows = await client.query<{ id: number }>(
        `SELECT id FROM trace_stakeholders WHERE project_id = $1 AND id = ANY($2::int[])`,
        [projectId, stakeholderIds]
      );
      if (rows.rows.length !== stakeholderIds.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: 'Some stakeholders do not belong to this project' });
        return;
      }
    }
    const surveyRows = await client.query<{ id: number; share_token: string }>(
      `INSERT INTO survey_forms (project_id, title, description, objective, category, status, allow_audio, allow_document, allow_anonymous_response, share_token, due_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, share_token`,
      [
        projectId,
        parsed.data.title,
        parsed.data.description,
        parsed.data.objective ?? null,
        parsed.data.category,
        parsed.data.status,
        parsed.data.allow_audio,
        parsed.data.allow_document,
        parsed.data.allow_anonymous_response,
        createShareToken(),
        parsed.data.due_at || null,
        userId
      ]
    );
    const surveyId = surveyRows.rows[0].id;
    const createdQuestions: QuestionRow[] = [];
    for (const question of parsed.data.questions) {
      const questionRows = await client.query<QuestionRow>(
        `INSERT INTO survey_questions (survey_id, question_text, question_type, required, options, sort_order, help_text)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING id, survey_id, question_text, question_type, required, options, sort_order, help_text`,
        [
          surveyId,
          question.question_text,
          question.question_type,
          question.required,
          JSON.stringify(question.options),
          question.sort_order,
          question.help_text ?? null
        ]
      );
      createdQuestions.push(questionRows.rows[0]);
    }
    for (const stakeholderId of stakeholderIds) {
      await client.query(
        `INSERT INTO survey_recipients (survey_id, stakeholder_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [surveyId, stakeholderId]
      );
    }
    const sessionId = await ensureSurveyTraceSession(
      client,
      {
        id: surveyId,
        project_id: projectId,
        title: parsed.data.title,
        description: parsed.data.description,
        objective: parsed.data.objective ?? null,
        category: parsed.data.category,
        status: parsed.data.status,
        allow_audio: parsed.data.allow_audio,
        allow_document: parsed.data.allow_document,
        allow_anonymous_response: parsed.data.allow_anonymous_response,
        share_token: surveyRows.rows[0].share_token,
        due_at: parsed.data.due_at || null,
        trace_session_id: null,
        created_at: '',
        updated_at: '',
        response_count: 0
      },
      createdQuestions,
      stakeholderIds
    );
    await client.query('COMMIT');
    res.status(201).json({ id: surveyId, share_token: surveyRows.rows[0].share_token, trace_session_id: sessionId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err?.message ?? 'Could not create survey' });
  } finally {
    client.release();
  }
});

router.post('/projects/:projectId/surveys/ai-questions', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const projectId = Number(req.params.projectId);
  const userId = req.user?.sub;
  if (!userId || Number.isNaN(projectId) || !(await hasProjectAccess(projectId, userId))) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }
  const parsed = aiQuestionsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const contextRows = await pool.query<{
    project_name: string | null;
    project_description: string | null;
    project_objective: string | null;
    project_scope: string | null;
    stakeholders: string | null;
    processes: string | null;
    findings: string | null;
    requirements: string | null;
  }>(
    `SELECT p.name AS project_name,
            p.description AS project_description,
            p.objective AS project_objective,
            p.scope AS project_scope,
            (SELECT string_agg(name || ' (' || role || ')', '; ') FROM trace_stakeholders WHERE project_id = p.id) AS stakeholders,
            (SELECT string_agg(name || ': ' || COALESCE(description, ''), '; ') FROM processes WHERE project_id = p.id) AS processes,
            (SELECT string_agg(f.statement, '; ')
             FROM trace_findings f
             INNER JOIN trace_sessions s ON s.id = f.session_id
             WHERE s.project_id = p.id) AS findings,
            (SELECT string_agg(code || ': ' || description, '; ') FROM trace_requirements WHERE project_id = p.id) AS requirements
     FROM projects p
     WHERE p.id = $1`,
    [projectId]
  );
  const context = contextRows.rows[0];
  if (!context) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  try {
    const result = await requestOpenRouterStructured({
      schema: aiQuestionsOutputSchema,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            [
              'Eres analista senior de requisitos y discovery de producto.',
              'Tu trabajo NO es hacer preguntas genericas; tu trabajo es descubrir reglas de negocio, excepciones, datos requeridos, dolores operativos, frecuencia, prioridad, errores y criterios de aceptacion.',
              'Adapta cada pregunta al dominio y al rol indicado. Si el enfoque dice "mesero", pregunta como mesero; si dice "cajero", pregunta como caja; no mezcles roles.',
              'Evita frases vagas como "que mejorarías" salvo que estén aterrizadas a una operacion concreta.',
              'Cada pregunta debe poder convertirse despues en hallazgo o requisito.'
            ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Proyecto: ${context.project_name ?? 'Proyecto'}`,
            `Descripcion: ${context.project_description ?? '-'}`,
            `Objetivo: ${context.project_objective ?? '-'}`,
            `Alcance: ${context.project_scope ?? '-'}`,
            `Stakeholders: ${context.stakeholders ?? '-'}`,
            `Procesos: ${context.processes ?? '-'}`,
            `Hallazgos: ${context.findings ?? '-'}`,
            `Requisitos: ${context.requirements ?? '-'}`,
            `Titulo de encuesta: ${parsed.data.title || '-'}`,
            `Descripcion de encuesta: ${parsed.data.description || '-'}`,
            `Objetivo de encuesta: ${parsed.data.objective || '-'}`,
            `Mini prompt del usuario: ${parsed.data.prompt || '-'}`,
            `Cantidad deseada: ${parsed.data.count}`,
            '',
            'Genera preguntas concretas, no genericas. Cubre al menos 6 de estas categorias: pasos del flujo, datos capturados, excepciones, errores frecuentes, tiempos/esperas, decisiones del usuario, integraciones/reportes, permisos, evidencia visual, prioridad.',
            'Incluye opciones especificas del dominio cuando uses single_choice o multiple_choice.',
            'No preguntes por temas fuera del rol indicado en el mini prompt.',
            'Devuelve exclusivamente JSON con forma {"questions":[{"question_text":"...","question_type":"short_text|long_text|single_choice|multiple_choice|scale_1_5|yes_no","required":true,"options":["..."],"rationale":"..."}]}',
            'Para single_choice y multiple_choice incluye 3 a 6 opciones concretas. Para otros tipos usa options [].'
          ].join('\n')
        }
      ]
    });

    res.json({
      questions: result.data.questions.map((question, index) => ({ ...question, sort_order: index })),
      model: result.model
    });
  } catch (err: any) {
    const message = String(err?.message ?? 'Could not generate survey questions');
    if (message.includes('OPENROUTER_API_KEY')) {
      res.json({
        questions: buildFallbackSurveyQuestions(parsed.data),
        model: 'fallback-local',
        warning: 'OPENROUTER_API_KEY is not configured; generated editable fallback questions.'
      });
      return;
    }
    res.status(502).json({ message });
  }
});

router.patch('/:surveyId/status', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const surveyId = Number(req.params.surveyId);
  const userId = req.user?.sub;
  const parsed = z.object({ status: z.enum(['draft', 'active', 'closed']) }).safeParse(req.body);
  if (!userId || Number.isNaN(surveyId) || !parsed.success) {
    res.status(400).json({ message: 'Invalid request' });
    return;
  }
  const rows = await pool.query<{ project_id: number }>('SELECT project_id FROM survey_forms WHERE id = $1', [surveyId]);
  const survey = rows.rows[0];
  if (!survey || !(await hasProjectAccess(survey.project_id, userId))) {
    res.status(404).json({ message: 'Survey not found' });
    return;
  }
  await pool.query('UPDATE survey_forms SET status = $1, updated_at = NOW() WHERE id = $2', [parsed.data.status, surveyId]);
  res.json({ status: parsed.data.status });
});

router.get('/:surveyId/results', async (req: AuthRequest, res) => {
  await ensureSurveySchema();
  const surveyId = Number(req.params.surveyId);
  const userId = req.user?.sub;
  if (!userId || Number.isNaN(surveyId)) {
    res.status(400).json({ message: 'Invalid survey id' });
    return;
  }
  const surveyRows = await pool.query<{ project_id: number }>('SELECT project_id FROM survey_forms WHERE id = $1', [surveyId]);
  const survey = surveyRows.rows[0];
  if (!survey || !(await hasProjectAccess(survey.project_id, userId))) {
    res.status(404).json({ message: 'Survey not found' });
    return;
  }
  const questions = await getSurveyQuestions(surveyId);
  const responses = await pool.query<ResponseRow>(
    `SELECT sr.id,
            sr.survey_id,
            sr.stakeholder_id,
            sr.respondent_name,
            sr.respondent_contact,
            sr.response_mode,
            sr.notes,
            sr.submitted_at::text,
            sr.trace_session_id,
            ts.name AS stakeholder_name,
            ts.role AS stakeholder_role,
            COALESCE(
              json_agg(json_build_object('question_id', sa.question_id, 'answer', sa.answer) ORDER BY sa.question_id)
                FILTER (WHERE sa.id IS NOT NULL),
              '[]'
            ) AS answers
     FROM survey_responses sr
     LEFT JOIN trace_stakeholders ts ON ts.id = sr.stakeholder_id
     LEFT JOIN survey_answers sa ON sa.response_id = sr.id
     WHERE sr.survey_id = $1
     GROUP BY sr.id, ts.id
     ORDER BY sr.submitted_at DESC`,
    [surveyId]
  );
  const metrics = questions.map((question) => {
    const values = responses.rows.flatMap((response) => {
      const answer = response.answers.find((item) => item.question_id === question.id)?.answer;
      return Array.isArray(answer) ? answer : answer === undefined || answer === null ? [] : [answer];
    });
    const counts = values.reduce<Record<string, number>>((acc, value) => {
      const key = String(value);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return { question_id: question.id, question_text: question.question_text, question_type: question.question_type, counts };
  });
  res.json({ questions, responses: responses.rows, metrics });
});

export default router;
