-- Traceability hardening migration.
-- Focus: enforce integrity and quality in evidence/findings without removing legacy structures.

ALTER TABLE trace_evidences
  DROP CONSTRAINT IF EXISTS trace_evidences_kind_check;

ALTER TABLE trace_evidences
  ADD CONSTRAINT trace_evidences_kind_check
  CHECK (kind IN ('file', 'note', 'audio', 'transcript'));

CREATE INDEX IF NOT EXISTS idx_trace_findings_dedupe_key ON trace_findings(dedupe_key);

CREATE OR REPLACE FUNCTION trace_validate_finding_integrity()
RETURNS TRIGGER AS $$
DECLARE
  normalized_statement TEXT;
  words_count INTEGER;
BEGIN
  normalized_statement := LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NEW.statement, '')), '\s+', ' ', 'g'));

  IF CHAR_LENGTH(normalized_statement) < 20 THEN
    RAISE EXCEPTION 'Finding statement must contain at least 20 characters';
  END IF;

  SELECT ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(normalized_statement, '\s+'), 1)
  INTO words_count;

  IF COALESCE(words_count, 0) < 4 THEN
    RAISE EXCEPTION 'Finding statement must contain at least 4 words';
  END IF;

  IF NEW.dedupe_key IS NULL OR BTRIM(NEW.dedupe_key) = '' THEN
    NEW.dedupe_key := 'auto:' || SUBSTRING(MD5(normalized_statement) FROM 1 FOR 24);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM trace_evidences e
    WHERE e.session_id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'Session % must have at least one evidence before creating findings', NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_validate_finding_integrity ON trace_findings;
CREATE TRIGGER trg_trace_validate_finding_integrity
BEFORE INSERT OR UPDATE ON trace_findings
FOR EACH ROW
EXECUTE FUNCTION trace_validate_finding_integrity();
