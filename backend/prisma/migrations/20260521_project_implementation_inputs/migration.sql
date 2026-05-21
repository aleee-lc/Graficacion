CREATE TABLE IF NOT EXISTS "public"."project_implementation_inputs" (
  "project_id" INTEGER NOT NULL,
  "target_stack" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "implementation_contracts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "data_entities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "target_roles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "project_implementation_inputs_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "project_implementation_inputs_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_project_implementation_inputs_updated"
  ON "public"."project_implementation_inputs"("updated_at" DESC);

CREATE OR REPLACE FUNCTION "public"."set_project_implementation_inputs_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_implementation_inputs_updated_at"
  ON "public"."project_implementation_inputs";

CREATE TRIGGER "trg_project_implementation_inputs_updated_at"
  BEFORE UPDATE ON "public"."project_implementation_inputs"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."set_project_implementation_inputs_updated_at"();
