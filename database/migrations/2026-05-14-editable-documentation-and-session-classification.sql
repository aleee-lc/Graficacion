ALTER TABLE trace_sessions
  ADD COLUMN IF NOT EXISTS discovery_type TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned';

ALTER TABLE trace_sessions DROP CONSTRAINT IF EXISTS trace_sessions_discovery_type_check;
ALTER TABLE trace_sessions ADD CONSTRAINT trace_sessions_discovery_type_check
  CHECK (discovery_type IN ('direct', 'indirect', 'self_managed', 'synthesis'));

ALTER TABLE trace_sessions DROP CONSTRAINT IF EXISTS trace_sessions_status_check;
ALTER TABLE trace_sessions ADD CONSTRAINT trace_sessions_status_check
  CHECK (status IN ('planned', 'in_analysis', 'completed'));

UPDATE trace_sessions
   SET discovery_type = CASE
     WHEN LOWER(TRIM(technique)) = 'documento' THEN 'indirect'
     WHEN LOWER(TRIM(technique)) IN ('cuestionario', 'encuesta') THEN 'self_managed'
     WHEN LOWER(TRIM(technique)) IN ('historias de usuario', 'user story mapping', 'prototipado rapido', 'refinamiento tecnico') THEN 'synthesis'
     ELSE 'direct'
   END;

UPDATE trace_sessions s
   SET status = CASE
     WHEN EXISTS (SELECT 1 FROM trace_findings f WHERE f.session_id = s.id) THEN 'completed'
     WHEN EXISTS (SELECT 1 FROM trace_evidences e WHERE e.session_id = s.id) THEN 'in_analysis'
     ELSE s.status
   END
 WHERE s.status = 'planned';

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_use_cases_requirement
  ON trace_use_cases(requirement_id);

CREATE INDEX IF NOT EXISTS idx_trace_use_cases_project
  ON trace_use_cases(project_id, updated_at DESC);
