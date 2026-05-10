const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PASSWORD_SALT_ROUNDS = 10;

const USER_TYPES = ['TECH', 'CLIENT'];
const TECHNIQUE_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'];
const REQUIREMENT_SOURCES = ['INTERVIEW', 'SURVEY', 'OBSERVATION', 'WORKSHOP', 'DOCUMENT'];
const REQUIREMENT_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
const RELATIONSHIP_TYPES = ['ASSOCIATION', 'AGGREGATION', 'COMPOSITION', 'INHERITANCE', 'DEPENDENCY'];

const TECH_ROLES = ['Project Manager', 'Developer', 'QA', 'UX', 'DevOps'];
const STAKEHOLDER_ROLES = ['Product Owner', 'Business Sponsor', 'Operations'];

const DEFAULT_TECHNIQUES = [
  {
    name: 'Entrevista',
    description: 'Conversaciones guiadas con usuarios y stakeholders para descubrir necesidades y objetivos.'
  },
  {
    name: 'Observacion',
    description: 'Observacion del flujo real de trabajo para detectar cuellos de botella y oportunidades.'
  },
  {
    name: 'Taller de descubrimiento',
    description: 'Sesion colaborativa para alinear negocio, producto y tecnologia sobre el alcance.'
  },
  {
    name: 'Encuesta',
    description: 'Recoleccion de datos cuantitativos para validar hipotesis de uso y priorizacion.'
  },
  {
    name: 'Analisis documental',
    description: 'Revision de procesos, reglas de negocio y documentacion existente del dominio.'
  },
  {
    name: 'User story mapping',
    description: 'Desglose del journey de usuario para estructurar el backlog y plan de entregas.'
  },
  {
    name: 'Prototipado rapido',
    description: 'Validacion temprana de ideas de interfaz y flujo antes del desarrollo completo.'
  },
  {
    name: 'Refinamiento tecnico',
    description: 'Sesion tecnica para detallar requerimientos, riesgos y criterios de aceptacion.'
  }
];

const DEMO_USERS = [
  {
    key: 'tech_admin',
    name: 'Admin Tecnico',
    email: 'admin@graficacion.local',
    password: 'Admin12345!',
    type: 'TECH',
    techRoles: ['Project Manager', 'Developer']
  },
  {
    key: 'tech_analyst',
    name: 'Ana Analista',
    email: 'ana.analista@graficacion.local',
    password: 'Analista123!',
    type: 'TECH',
    techRoles: ['Developer', 'QA']
  },
  {
    key: 'tech_ux',
    name: 'Uriel UX',
    email: 'uriel.ux@graficacion.local',
    password: 'Diseno123!',
    type: 'TECH',
    techRoles: ['UX']
  },
  {
    key: 'client_po',
    name: 'Paula Product Owner',
    email: 'paula.po@graficacion.local',
    type: 'CLIENT',
    company: 'Universidad Central',
    stakeholderRole: 'Product Owner'
  },
  {
    key: 'client_sponsor',
    name: 'Carlos Sponsor',
    email: 'carlos.sponsor@graficacion.local',
    type: 'CLIENT',
    company: 'Finanzas Orion',
    stakeholderRole: 'Business Sponsor'
  }
];

const DEMO_PROJECTS = [
  {
    name: 'Sistema de Gestion Academica',
    description: 'Plataforma para recopilar requisitos de inscripciones y control escolar.',
    startDate: '2026-04-01',
    endDate: '2026-09-30',
    members: ['tech_admin', 'tech_analyst', 'tech_ux', 'client_po'],
    processes: [
      {
        name: 'Levantamiento de requisitos',
        description: 'Captura de necesidades academicas con usuarios clave.',
        subprocesses: [
          {
            name: 'Analisis funcional',
            description: 'Definicion de alcance funcional por modulo.',
            assignments: [
              {
                technique: 'Entrevista',
                techUser: 'tech_analyst',
                stakeholders: ['client_po'],
                status: 'PLANNED',
                durationMinutes: 90
              },
              {
                technique: 'Observacion',
                techUser: 'tech_ux',
                stakeholders: ['client_po'],
                status: 'PLANNED',
                durationMinutes: 60
              }
            ]
          }
        ]
      }
    ]
  },
  {
    name: 'Portal de Servicio al Cliente',
    description: 'Proyecto para centralizar solicitudes y seguimiento de atencion.',
    startDate: '2026-05-01',
    endDate: '2026-11-30',
    members: ['tech_admin', 'tech_analyst', 'client_sponsor'],
    processes: [
      {
        name: 'Definicion del backlog inicial',
        description: 'Priorizacion de historias y criterios de aceptacion.',
        subprocesses: [
          {
            name: 'Sesion de descubrimiento',
            description: 'Alineacion de negocio y experiencia de usuario.',
            assignments: [
              {
                technique: 'Taller de descubrimiento',
                techUser: 'tech_admin',
                stakeholders: ['client_sponsor'],
                status: 'PLANNED',
                durationMinutes: 120
              }
            ]
          }
        ]
      }
    ]
  }
];

const normalize = (value) => value.trim().toLowerCase();

async function ensureCatalogRows(client, tableName, codes) {
  for (const code of codes) {
    await client.query(
      `INSERT INTO ${tableName} (code)
       VALUES ($1)
       ON CONFLICT (code) DO NOTHING`,
      [code]
    );
  }
}

async function getUserTypeId(client, code) {
  const result = await client.query(
    `SELECT id FROM user_types WHERE UPPER(code) = $1 LIMIT 1`,
    [code.trim().toUpperCase()]
  );
  return result.rows[0]?.id ?? null;
}

async function ensureRole(client, tableName, roleName) {
  const existing = await client.query(
    `SELECT id FROM ${tableName}
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [roleName]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `INSERT INTO ${tableName} (name)
     VALUES ($1)
     RETURNING id`,
    [roleName]
  );

  return created.rows[0].id;
}

async function ensureTechnique(client, technique) {
  const existing = await client.query(
    `SELECT id FROM techniques
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [technique.name]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `INSERT INTO techniques (name, description)
     VALUES ($1, $2)
     RETURNING id`,
    [technique.name, technique.description]
  );

  return created.rows[0].id;
}

async function ensureUser(client, userDefinition, userTypeId) {
  const existing = await client.query(
    `SELECT id
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [userDefinition.email]
  );

  const hashedPassword = userDefinition.password
    ? await bcrypt.hash(userDefinition.password, PASSWORD_SALT_ROUNDS)
    : null;

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id;
    await client.query(
      `UPDATE users
       SET name = $1,
           user_type = $2,
           password = COALESCE($3, password)
       WHERE id = $4`,
      [userDefinition.name, userTypeId, hashedPassword, userId]
    );
    return userId;
  }

  const created = await client.query(
    `INSERT INTO users (name, email, password, user_type, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id`,
    [userDefinition.name, userDefinition.email, hashedPassword, userTypeId]
  );

  return created.rows[0].id;
}

async function ensureStakeholderProfile(client, userId, stakeholderRoleId, companyName) {
  await client.query(
    `INSERT INTO stakeholder_profile (user_id, stakeholder_role_id, company_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET stakeholder_role_id = EXCLUDED.stakeholder_role_id,
           company_name = EXCLUDED.company_name`,
    [userId, stakeholderRoleId, companyName]
  );
}

async function ensureTechUserRole(client, userId, roleId) {
  await client.query(
    `INSERT INTO tech_user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );
}

async function ensureProject(client, projectDefinition) {
  const existing = await client.query(
    `SELECT id
     FROM projects
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [projectDefinition.name]
  );

  if (existing.rows.length > 0) {
    const projectId = existing.rows[0].id;
    await client.query(
      `UPDATE projects
       SET description = $1,
           start_date = $2,
           end_date = $3
       WHERE id = $4`,
      [projectDefinition.description, projectDefinition.startDate, projectDefinition.endDate, projectId]
    );
    return projectId;
  }

  const created = await client.query(
    `INSERT INTO projects (name, description, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      projectDefinition.name,
      projectDefinition.description,
      projectDefinition.startDate,
      projectDefinition.endDate
    ]
  );
  return created.rows[0].id;
}

async function ensureProjectMember(client, projectId, userId) {
  await client.query(
    `INSERT INTO project_users (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [projectId, userId]
  );
}

async function ensureProcess(client, projectId, processDefinition) {
  const existing = await client.query(
    `SELECT id
     FROM processes
     WHERE project_id = $1
       AND LOWER(TRIM(name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [projectId, processDefinition.name]
  );

  if (existing.rows.length > 0) {
    const processId = existing.rows[0].id;
    await client.query(
      `UPDATE processes
       SET description = $1
       WHERE id = $2`,
      [processDefinition.description, processId]
    );
    return processId;
  }

  const created = await client.query(
    `INSERT INTO processes (project_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [projectId, processDefinition.name, processDefinition.description]
  );

  return created.rows[0].id;
}

async function ensureSubprocess(client, processId, subprocessDefinition) {
  const existing = await client.query(
    `SELECT id
     FROM subprocesses
     WHERE process_id = $1
       AND LOWER(TRIM(name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [processId, subprocessDefinition.name]
  );

  if (existing.rows.length > 0) {
    const subprocessId = existing.rows[0].id;
    await client.query(
      `UPDATE subprocesses
       SET description = $1
       WHERE id = $2`,
      [subprocessDefinition.description, subprocessId]
    );
    return subprocessId;
  }

  const created = await client.query(
    `INSERT INTO subprocesses (process_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [processId, subprocessDefinition.name, subprocessDefinition.description]
  );

  return created.rows[0].id;
}

async function ensureTechniqueAssignment(
  client,
  subprocessId,
  techniqueId,
  techUserId,
  durationMinutes,
  techniqueStatusId
) {
  const existing = await client.query(
    `SELECT id
     FROM subprocess_techniques
     WHERE subprocess_id = $1
       AND technique_id = $2
     LIMIT 1`,
    [subprocessId, techniqueId]
  );

  const scheduledDate = new Date().toISOString();

  if (existing.rows.length > 0) {
    const assignmentId = existing.rows[0].id;
    await client.query(
      `UPDATE subprocess_techniques
       SET tech_user_id = $1,
           scheduled_date = $2,
           duration_minutes = $3,
           status = $4
       WHERE id = $5`,
      [techUserId, scheduledDate, durationMinutes, techniqueStatusId, assignmentId]
    );
    return assignmentId;
  }

  const created = await client.query(
    `INSERT INTO subprocess_techniques
      (subprocess_id, technique_id, tech_user_id, scheduled_date, duration_minutes, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [subprocessId, techniqueId, techUserId, scheduledDate, durationMinutes, techniqueStatusId]
  );

  return created.rows[0].id;
}

async function ensureAssignmentStakeholder(client, assignmentId, stakeholderUserId) {
  await client.query(
    `INSERT INTO technique_stakeholders (subprocess_technique_id, stakeholder_user_id)
     VALUES ($1, $2)
     ON CONFLICT (subprocess_technique_id, stakeholder_user_id) DO NOTHING`,
    [assignmentId, stakeholderUserId]
  );
}

async function countRows(client, tableName) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return result.rows[0].count;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definido.');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    await ensureCatalogRows(client, 'user_types', USER_TYPES);
    await ensureCatalogRows(client, 'technique_statuses', TECHNIQUE_STATUSES);
    await ensureCatalogRows(client, 'requirement_sources_catalog', REQUIREMENT_SOURCES);
    await ensureCatalogRows(client, 'requirement_statuses', REQUIREMENT_STATUSES);
    await ensureCatalogRows(client, 'relationship_types', RELATIONSHIP_TYPES);

    const techRoleIdByName = new Map();
    const stakeholderRoleIdByName = new Map();
    const techniqueIdByName = new Map();
    const userIdByKey = new Map();

    for (const roleName of TECH_ROLES) {
      const roleId = await ensureRole(client, 'tech_roles', roleName);
      techRoleIdByName.set(normalize(roleName), roleId);
    }

    for (const roleName of STAKEHOLDER_ROLES) {
      const roleId = await ensureRole(client, 'stakeholder_roles', roleName);
      stakeholderRoleIdByName.set(normalize(roleName), roleId);
    }

    for (const technique of DEFAULT_TECHNIQUES) {
      const techniqueId = await ensureTechnique(client, technique);
      techniqueIdByName.set(normalize(technique.name), techniqueId);
    }

    const techUserTypeId = await getUserTypeId(client, 'TECH');
    const clientUserTypeId = await getUserTypeId(client, 'CLIENT');
    if (!techUserTypeId || !clientUserTypeId) {
      throw new Error('No se pudieron resolver user_types TECH/CLIENT.');
    }

    for (const userDefinition of DEMO_USERS) {
      const userTypeId = userDefinition.type === 'TECH' ? techUserTypeId : clientUserTypeId;
      const userId = await ensureUser(client, userDefinition, userTypeId);
      userIdByKey.set(userDefinition.key, userId);

      if (userDefinition.type === 'TECH') {
        for (const roleName of userDefinition.techRoles) {
          const roleId = techRoleIdByName.get(normalize(roleName));
          if (!roleId) {
            throw new Error(`Rol técnico no encontrado: ${roleName}`);
          }
          await ensureTechUserRole(client, userId, roleId);
        }
      } else {
        const stakeholderRoleId = stakeholderRoleIdByName.get(normalize(userDefinition.stakeholderRole));
        if (!stakeholderRoleId) {
          throw new Error(`Rol stakeholder no encontrado: ${userDefinition.stakeholderRole}`);
        }
        await ensureStakeholderProfile(client, userId, stakeholderRoleId, userDefinition.company);
      }
    }

    const plannedStatusIdResult = await client.query(
      `SELECT id FROM technique_statuses WHERE UPPER(code) = 'PLANNED' LIMIT 1`
    );
    const plannedStatusId = plannedStatusIdResult.rows[0]?.id;
    if (!plannedStatusId) {
      throw new Error('No se encontró el estado PLANNED en technique_statuses.');
    }

    for (const projectDefinition of DEMO_PROJECTS) {
      const projectId = await ensureProject(client, projectDefinition);

      for (const memberKey of projectDefinition.members) {
        const memberId = userIdByKey.get(memberKey);
        if (!memberId) {
          throw new Error(`Usuario no encontrado para el proyecto (${projectDefinition.name}): ${memberKey}`);
        }
        await ensureProjectMember(client, projectId, memberId);
      }

      for (const processDefinition of projectDefinition.processes) {
        const processId = await ensureProcess(client, projectId, processDefinition);

        for (const subprocessDefinition of processDefinition.subprocesses) {
          const subprocessId = await ensureSubprocess(client, processId, subprocessDefinition);

          for (const assignment of subprocessDefinition.assignments) {
            const techniqueId = techniqueIdByName.get(normalize(assignment.technique));
            if (!techniqueId) {
              throw new Error(`Técnica no encontrada: ${assignment.technique}`);
            }

            const techUserId = userIdByKey.get(assignment.techUser);
            if (!techUserId) {
              throw new Error(`Usuario técnico no encontrado: ${assignment.techUser}`);
            }

            const assignmentId = await ensureTechniqueAssignment(
              client,
              subprocessId,
              techniqueId,
              techUserId,
              assignment.durationMinutes,
              plannedStatusId
            );

            for (const stakeholderKey of assignment.stakeholders) {
              const stakeholderUserId = userIdByKey.get(stakeholderKey);
              if (!stakeholderUserId) {
                throw new Error(`Stakeholder no encontrado: ${stakeholderKey}`);
              }
              await ensureAssignmentStakeholder(client, assignmentId, stakeholderUserId);
            }
          }
        }
      }
    }

    await client.query('COMMIT');

    const summary = {
      user_types: await countRows(client, 'user_types'),
      users: await countRows(client, 'users'),
      projects: await countRows(client, 'projects'),
      processes: await countRows(client, 'processes'),
      subprocesses: await countRows(client, 'subprocesses'),
      subprocess_techniques: await countRows(client, 'subprocess_techniques'),
      technique_stakeholders: await countRows(client, 'technique_stakeholders')
    };

    console.log('Repoblado completado.');
    console.log('Resumen:', summary);
    console.log('Credenciales demo TECH:');
    console.log('- admin@graficacion.local / Admin12345!');
    console.log('- ana.analista@graficacion.local / Analista123!');
    console.log('- uriel.ux@graficacion.local / Diseno123!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Error al repoblar:', error.message);
  process.exit(1);
});
