ALTER TABLE trace_sessions
  ADD COLUMN IF NOT EXISTS technique_code TEXT,
  ADD COLUMN IF NOT EXISTS process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subprocess_id INTEGER REFERENCES subprocesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE trace_session_stakeholders
  ADD COLUMN IF NOT EXISTS participation_role TEXT NOT NULL DEFAULT 'participant',
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE trace_session_stakeholders DROP CONSTRAINT IF EXISTS trace_session_stakeholders_participation_role_check;
ALTER TABLE trace_session_stakeholders ADD CONSTRAINT trace_session_stakeholders_participation_role_check
  CHECK (participation_role IN ('subject', 'participant', 'approver', 'observer', 'respondent'));

CREATE INDEX IF NOT EXISTS idx_trace_sessions_technique_code
  ON trace_sessions(project_id, technique_code);

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
