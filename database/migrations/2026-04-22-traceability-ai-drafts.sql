-- Traceability AI drafts migration.
-- Adds draft storage for AI-assisted findings/requirements with strict project consistency.

CREATE TABLE IF NOT EXISTS trace_ai_draft_findings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_session_id INTEGER NOT NULL REFERENCES trace_sessions(id) ON DELETE CASCADE,
  source_evidence_ids INTEGER[] NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('problem', 'need', 'constraint')),
  statement TEXT NOT NULL,
  confidence NUMERIC(5,4),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  ai_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (array_length(source_evidence_ids, 1) >= 1),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE IF NOT EXISTS trace_ai_draft_requirements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_finding_ids INTEGER[] NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('functional', 'non_functional')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  confidence NUMERIC(5,4),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  ai_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (array_length(source_finding_ids, 1) >= 1),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX IF NOT EXISTS idx_trace_ai_draft_findings_project
  ON trace_ai_draft_findings(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_ai_draft_findings_session
  ON trace_ai_draft_findings(source_session_id);
CREATE INDEX IF NOT EXISTS idx_trace_ai_draft_requirements_project
  ON trace_ai_draft_requirements(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION trace_validate_ai_draft_finding_consistency()
RETURNS TRIGGER AS $$
DECLARE
  session_project_id INTEGER;
  mismatched_count INTEGER;
BEGIN
  SELECT project_id INTO session_project_id
  FROM trace_sessions
  WHERE id = NEW.source_session_id;

  IF session_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid source_session_id for AI finding draft';
  END IF;

  IF session_project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'AI finding draft session must belong to the same project';
  END IF;

  SELECT COUNT(*)::int INTO mismatched_count
  FROM UNNEST(NEW.source_evidence_ids) AS source_evidence_id
  LEFT JOIN trace_evidences e ON e.id = source_evidence_id AND e.session_id = NEW.source_session_id
  WHERE e.id IS NULL;

  IF mismatched_count > 0 THEN
    RAISE EXCEPTION 'AI finding draft evidence references must belong to source_session_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_validate_ai_draft_finding_consistency ON trace_ai_draft_findings;
CREATE TRIGGER trg_trace_validate_ai_draft_finding_consistency
BEFORE INSERT OR UPDATE ON trace_ai_draft_findings
FOR EACH ROW
EXECUTE FUNCTION trace_validate_ai_draft_finding_consistency();

CREATE OR REPLACE FUNCTION trace_validate_ai_draft_requirement_consistency()
RETURNS TRIGGER AS $$
DECLARE
  mismatched_count INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO mismatched_count
  FROM UNNEST(NEW.source_finding_ids) AS source_finding_id
  LEFT JOIN trace_findings f ON f.id = source_finding_id
  LEFT JOIN trace_sessions s ON s.id = f.session_id
  WHERE f.id IS NULL OR s.project_id <> NEW.project_id;

  IF mismatched_count > 0 THEN
    RAISE EXCEPTION 'AI requirement draft findings must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_validate_ai_draft_requirement_consistency ON trace_ai_draft_requirements;
CREATE TRIGGER trg_trace_validate_ai_draft_requirement_consistency
BEFORE INSERT OR UPDATE ON trace_ai_draft_requirements
FOR EACH ROW
EXECUTE FUNCTION trace_validate_ai_draft_requirement_consistency();

