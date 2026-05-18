ALTER TABLE survey_forms
  ADD COLUMN IF NOT EXISTS trace_session_id INTEGER REFERENCES trace_sessions(id) ON DELETE SET NULL;

