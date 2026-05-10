-- Traceability core migration (non-destructive).
-- Keeps legacy ERP-style structures and adds a new minimal domain focused on:
-- stakeholder -> session -> evidence -> finding -> requirement

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT;

CREATE TABLE IF NOT EXISTS trace_stakeholders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'external' CHECK (type IN ('internal', 'external')),
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trace_sessions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  technique TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_subprocess_technique_id INTEGER UNIQUE
);

CREATE TABLE IF NOT EXISTS trace_session_stakeholders (
  session_id INTEGER NOT NULL REFERENCES trace_sessions(id) ON DELETE CASCADE,
  stakeholder_id INTEGER NOT NULL REFERENCES trace_stakeholders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS trace_evidences (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES trace_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'note', 'audio')),
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_technique_evidence_id INTEGER UNIQUE
);

CREATE TABLE IF NOT EXISTS trace_findings (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES trace_sessions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('problem', 'need', 'constraint')),
  statement TEXT NOT NULL,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trace_requirements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('functional', 'non_functional')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_requirement_id INTEGER UNIQUE,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS trace_requirement_findings (
  requirement_id INTEGER NOT NULL REFERENCES trace_requirements(id) ON DELETE CASCADE,
  finding_id INTEGER NOT NULL REFERENCES trace_findings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requirement_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_stakeholders_project ON trace_stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_trace_sessions_project ON trace_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_trace_findings_session ON trace_findings(session_id);
CREATE INDEX IF NOT EXISTS idx_trace_requirements_project ON trace_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_trace_req_findings_finding ON trace_requirement_findings(finding_id);

CREATE OR REPLACE FUNCTION trace_validate_requirement_finding_project()
RETURNS TRIGGER AS $$
DECLARE
  requirement_project_id INTEGER;
  finding_project_id INTEGER;
BEGIN
  SELECT project_id INTO requirement_project_id
  FROM trace_requirements
  WHERE id = NEW.requirement_id;

  SELECT s.project_id INTO finding_project_id
  FROM trace_findings f
  INNER JOIN trace_sessions s ON s.id = f.session_id
  WHERE f.id = NEW.finding_id;

  IF requirement_project_id IS NULL OR finding_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid requirement/finding reference';
  END IF;

  IF requirement_project_id <> finding_project_id THEN
    RAISE EXCEPTION 'Requirement and finding must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_validate_requirement_finding_project ON trace_requirement_findings;
CREATE TRIGGER trg_trace_validate_requirement_finding_project
BEFORE INSERT OR UPDATE ON trace_requirement_findings
FOR EACH ROW
EXECUTE FUNCTION trace_validate_requirement_finding_project();

CREATE OR REPLACE FUNCTION trace_validate_session_has_stakeholder()
RETURNS TRIGGER AS $$
DECLARE
  stakeholder_count INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO stakeholder_count
  FROM trace_session_stakeholders
  WHERE session_id = NEW.id;

  IF stakeholder_count < 1 THEN
    RAISE EXCEPTION 'Session % must have at least one stakeholder', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_session_has_stakeholder ON trace_sessions;
CREATE CONSTRAINT TRIGGER trg_trace_session_has_stakeholder
AFTER INSERT OR UPDATE ON trace_sessions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trace_validate_session_has_stakeholder();

CREATE OR REPLACE FUNCTION trace_validate_requirement_has_finding()
RETURNS TRIGGER AS $$
DECLARE
  finding_count INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO finding_count
  FROM trace_requirement_findings
  WHERE requirement_id = NEW.id;

  IF finding_count < 1 THEN
    RAISE EXCEPTION 'Requirement % must have at least one finding', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_requirement_has_finding ON trace_requirements;
CREATE CONSTRAINT TRIGGER trg_trace_requirement_has_finding
AFTER INSERT OR UPDATE ON trace_requirements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trace_validate_requirement_has_finding();
