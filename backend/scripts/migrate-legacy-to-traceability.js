const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    await client.query('BEGIN');

    // 1) Backfill stakeholders from existing CLIENT project users.
    await client.query(`
      INSERT INTO trace_stakeholders (project_id, name, role, type, contact)
      SELECT pu.project_id,
             COALESCE(u.name, 'Stakeholder sin nombre'),
             COALESCE(sr.name, 'Stakeholder'),
             'external',
             u.email
      FROM project_users pu
      INNER JOIN users u ON u.id = pu.user_id
      INNER JOIN user_types ut ON ut.id = u.user_type
      LEFT JOIN stakeholder_profile sp ON sp.user_id = u.id
      LEFT JOIN stakeholder_roles sr ON sr.id = sp.stakeholder_role_id
      WHERE UPPER(ut.code) = 'CLIENT'
      AND NOT EXISTS (
        SELECT 1
        FROM trace_stakeholders ts
        WHERE ts.project_id = pu.project_id
          AND LOWER(ts.name) = LOWER(COALESCE(u.name, 'Stakeholder sin nombre'))
          AND LOWER(ts.role) = LOWER(COALESCE(sr.name, 'Stakeholder'))
      );
    `);

    // 2) Backfill sessions from legacy subprocess_techniques.
    await client.query(`
      INSERT INTO trace_sessions (
        project_id,
        technique,
        title,
        notes,
        occurred_at,
        legacy_subprocess_technique_id
      )
      SELECT p.project_id,
             COALESCE(t.name, 'Tecnica no especificada'),
             CONCAT('Sesion legacy #', st.id),
             NULL,
             COALESCE(st.scheduled_date, NOW()),
             st.id
      FROM subprocess_techniques st
      INNER JOIN subprocesses sp ON sp.id = st.subprocess_id
      INNER JOIN processes p ON p.id = sp.process_id
      LEFT JOIN techniques t ON t.id = st.technique_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM trace_sessions ts
        WHERE ts.legacy_subprocess_technique_id = st.id
      );
    `);

    // 3) Backfill evidences from legacy technique_evidences.
    await client.query(`
      INSERT INTO trace_evidences (
        session_id,
        kind,
        file_name,
        mime_type,
        size_bytes,
        notes,
        created_at,
        legacy_technique_evidence_id
      )
      SELECT ts.id,
             CASE
               WHEN te.mime_type ILIKE 'audio/%' THEN 'audio'
               ELSE 'file'
             END,
             te.original_name,
             te.mime_type,
             te.size_bytes,
             te.notes,
             te.created_at,
             te.id
      FROM technique_evidences te
      INNER JOIN trace_sessions ts ON ts.legacy_subprocess_technique_id = te.subprocess_technique_id
      WHERE te.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM trace_evidences e
        WHERE e.legacy_technique_evidence_id = te.id
      );
    `);

    // 4) Backfill requirement shell records from legacy requirements.
    await client.query(`
      INSERT INTO trace_requirements (
        project_id,
        code,
        type,
        priority,
        description,
        acceptance_criteria,
        created_at,
        legacy_requirement_id
      )
      SELECT r.project_id,
             CONCAT('REQ-', LPAD(r.id::text, 4, '0')),
             'functional',
             'medium',
             COALESCE(r.title, 'Requisito legacy') || ' - ' || COALESCE(r.description, ''),
             'Migrado desde sistema legacy. Pendiente normalizacion.',
             NOW(),
             r.id
      FROM requirements r
      WHERE r.project_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM trace_requirements tr
        WHERE tr.legacy_requirement_id = r.id
      );
    `);

    // 5) Backfill findings from legacy requirement sources and link to requirements.
    await client.query(`
      WITH source_rows AS (
        SELECT rs.requirement_id,
               tr.id AS trace_requirement_id,
               ts.id AS trace_session_id,
               st.id AS legacy_assignment_id,
               t.name AS technique_name
        FROM requirement_sources rs
        INNER JOIN technique_results tr_legacy ON tr_legacy.id = rs.technique_result_id
        INNER JOIN subprocess_techniques st ON st.id = tr_legacy.subprocess_technique_id
        INNER JOIN trace_sessions ts ON ts.legacy_subprocess_technique_id = st.id
        INNER JOIN trace_requirements tr ON tr.legacy_requirement_id = rs.requirement_id
        LEFT JOIN techniques t ON t.id = st.technique_id
      ),
      inserted_findings AS (
        INSERT INTO trace_findings (session_id, category, statement, dedupe_key, created_at)
        SELECT DISTINCT
          sr.trace_session_id,
          'need',
          CONCAT(
            'Hallazgo migrado desde fuente legacy (req ',
            sr.requirement_id,
            ', tecnica ',
            COALESCE(sr.technique_name, 'N/A'),
            ')'
          ),
          CONCAT('legacy-req-', sr.requirement_id, '-assign-', sr.legacy_assignment_id),
          NOW()
        FROM source_rows sr
        ON CONFLICT DO NOTHING
        RETURNING id, session_id, dedupe_key
      ),
      resolved_findings AS (
        SELECT f.id,
               f.session_id,
               f.dedupe_key
        FROM trace_findings f
        WHERE f.dedupe_key LIKE 'legacy-req-%-assign-%'
      )
      INSERT INTO trace_requirement_findings (requirement_id, finding_id, created_at)
      SELECT DISTINCT
        sr.trace_requirement_id,
        rf.id,
        NOW()
      FROM source_rows sr
      INNER JOIN resolved_findings rf
        ON rf.session_id = sr.trace_session_id
       AND rf.dedupe_key = CONCAT('legacy-req-', sr.requirement_id, '-assign-', sr.legacy_assignment_id)
      ON CONFLICT DO NOTHING;
    `);

    // 6) Ensure each backfilled session has at least one stakeholder.
    await client.query(`
      WITH candidate AS (
        SELECT s.id AS session_id,
               st.id AS stakeholder_id,
               ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY st.id) AS rn
        FROM trace_sessions s
        INNER JOIN trace_stakeholders st ON st.project_id = s.project_id
      )
      INSERT INTO trace_session_stakeholders (session_id, stakeholder_id, created_at)
      SELECT c.session_id, c.stakeholder_id, NOW()
      FROM candidate c
      WHERE c.rn = 1
      AND NOT EXISTS (
        SELECT 1
        FROM trace_session_stakeholders ss
        WHERE ss.session_id = c.session_id
      );
    `);

    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log('Legacy data migrated to traceability core.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed legacy migration:', error.message);
  process.exit(1);
});
