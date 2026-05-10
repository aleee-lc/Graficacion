-- Traceability storage migration.
-- Adds physical storage references for uploaded evidence files.

ALTER TABLE trace_evidences
  ADD COLUMN IF NOT EXISTS bucket TEXT,
  ADD COLUMN IF NOT EXISTS object_path TEXT;

CREATE INDEX IF NOT EXISTS idx_trace_evidences_session_created
  ON trace_evidences(session_id, created_at DESC);
