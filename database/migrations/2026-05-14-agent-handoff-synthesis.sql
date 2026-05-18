ALTER TABLE trace_sessions DROP CONSTRAINT IF EXISTS trace_sessions_discovery_type_check;

ALTER TABLE trace_sessions ADD CONSTRAINT trace_sessions_discovery_type_check
  CHECK (discovery_type IN ('direct', 'indirect', 'self_managed', 'synthesis'));

UPDATE trace_sessions
   SET discovery_type = 'synthesis'
 WHERE LOWER(TRIM(technique)) IN ('historias de usuario', 'user story mapping', 'prototipado rapido', 'refinamiento tecnico');
