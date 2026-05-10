CREATE TABLE IF NOT EXISTS technique_evidences (
  id SERIAL PRIMARY KEY,
  subprocess_technique_id INTEGER NOT NULL REFERENCES subprocess_techniques(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL UNIQUE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_technique_evidences_assignment_active
  ON technique_evidences (subprocess_technique_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_technique_evidences_project_active
  ON technique_evidences (project_id, created_at DESC)
  WHERE deleted_at IS NULL;
