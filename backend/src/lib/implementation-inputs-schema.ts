import { pool } from '../db/pool';

let implementationInputsSchemaReady = false;

export const ensureImplementationInputsSchema = async () => {
  if (implementationInputsSchemaReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_implementation_inputs (
      project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      target_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
      implementation_contracts JSONB NOT NULL DEFAULT '[]'::jsonb,
      data_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_project_implementation_inputs_updated
      ON project_implementation_inputs(updated_at DESC);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION set_project_implementation_inputs_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_project_implementation_inputs_updated_at
      ON project_implementation_inputs;

    CREATE TRIGGER trg_project_implementation_inputs_updated_at
      BEFORE UPDATE ON project_implementation_inputs
      FOR EACH ROW
      EXECUTE FUNCTION set_project_implementation_inputs_updated_at();
  `);

  implementationInputsSchemaReady = true;
};
