import { pool } from '../db/pool';

let traceabilityWorkspaceSchemaReady = false;

export type DiscoveryType = 'direct' | 'indirect' | 'self_managed' | 'synthesis';
export type SessionStatus = 'planned' | 'in_analysis' | 'completed';

export const discoveryTypeForTechnique = (technique: string): DiscoveryType => {
  const normalized = technique.trim().toLowerCase();
  if (normalized === 'documento') {
    return 'indirect';
  }
  if (normalized === 'cuestionario' || normalized === 'encuesta') {
    return 'self_managed';
  }
  if (
    normalized === 'historias de usuario' ||
    normalized === 'user story mapping' ||
    normalized === 'prototipado rapido' ||
    normalized === 'refinamiento tecnico'
  ) {
    return 'synthesis';
  }
  return 'direct';
};

export const ensureTraceabilityWorkspaceSchema = async () => {
  if (traceabilityWorkspaceSchemaReady) {
    return;
  }

  // Execute all operations as separate queries to avoid trigger lock issues
  await pool.query(`
    ALTER TABLE trace_sessions
      ADD COLUMN IF NOT EXISTS discovery_type TEXT NOT NULL DEFAULT 'direct',
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned',
      ADD COLUMN IF NOT EXISTS technique_code TEXT,
      ADD COLUMN IF NOT EXISTS process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS subprocess_id INTEGER REFERENCES subprocesses(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE trace_sessions DROP CONSTRAINT IF EXISTS trace_sessions_discovery_type_check;
    ALTER TABLE trace_sessions ADD CONSTRAINT trace_sessions_discovery_type_check
      CHECK (discovery_type IN ('direct', 'indirect', 'self_managed', 'synthesis'));
  `);

  await pool.query(`
    ALTER TABLE trace_sessions DROP CONSTRAINT IF EXISTS trace_sessions_status_check;
    ALTER TABLE trace_sessions ADD CONSTRAINT trace_sessions_status_check
      CHECK (status IN ('planned', 'in_analysis', 'completed'));
  `);

  await pool.query(`
    UPDATE trace_sessions
       SET discovery_type = CASE
         WHEN COALESCE(technique_code, '') = 'document_analysis' OR LOWER(TRIM(technique)) = 'documento' THEN 'indirect'
         WHEN COALESCE(technique_code, '') = 'transaction_tracking' THEN 'direct'
         WHEN COALESCE(technique_code, '') = 'survey' OR LOWER(TRIM(technique)) IN ('cuestionario', 'encuesta') THEN 'self_managed'
         WHEN COALESCE(technique_code, '') = 'user_story_synthesis' OR LOWER(TRIM(technique)) IN ('historias de usuario', 'user story mapping', 'prototipado rapido', 'refinamiento tecnico') THEN 'synthesis'
         ELSE 'direct'
       END;
  `);

  await pool.query(`
    ALTER TABLE trace_session_stakeholders
      ADD COLUMN IF NOT EXISTS participation_role TEXT NOT NULL DEFAULT 'participant',
      ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE trace_session_stakeholders DROP CONSTRAINT IF EXISTS trace_session_stakeholders_participation_role_check;
    ALTER TABLE trace_session_stakeholders ADD CONSTRAINT trace_session_stakeholders_participation_role_check
      CHECK (participation_role IN ('subject', 'participant', 'approver', 'observer', 'respondent'));
  `);

  await pool.query(`
    UPDATE trace_sessions s
       SET status = CASE
         WHEN EXISTS (SELECT 1 FROM trace_findings f WHERE f.session_id = s.id) THEN 'completed'
         WHEN EXISTS (SELECT 1 FROM trace_evidences e WHERE e.session_id = s.id) THEN 'in_analysis'
         ELSE s.status
       END
     WHERE s.status = 'planned';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trace_use_cases (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      requirement_id INTEGER NOT NULL REFERENCES trace_requirements(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      benefit TEXT NOT NULL,
      acceptance_criteria TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_use_cases_requirement
      ON trace_use_cases(requirement_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trace_use_cases_project
      ON trace_use_cases(project_id, updated_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trace_sessions_technique_code
      ON trace_sessions(project_id, technique_code);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION trace_validate_session_has_stakeholder()
    RETURNS TRIGGER AS $$
    DECLARE
      stakeholder_count INTEGER;
      optional_codes TEXT[] := ARRAY['document_analysis', 'transaction_tracking', 'user_story_synthesis'];
    BEGIN
      IF COALESCE(NEW.technique_code, '') = ANY(optional_codes) THEN
        RETURN NEW;
      END IF;

      SELECT COUNT(*)::int INTO stakeholder_count
      FROM trace_session_stakeholders
      WHERE session_id = NEW.id;

      IF stakeholder_count < 1 THEN
        RAISE EXCEPTION 'Session % must have at least one stakeholder', NEW.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  traceabilityWorkspaceSchemaReady = true;
};
