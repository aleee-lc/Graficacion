require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

const PROJECT_NAME = 'PMS para Hoteles Pequenos - Demo OPERA';

const targetStack = {
  architectureType: 'SPA + API REST',
  backendFramework: 'FastAPI',
  backendLanguage: 'Python',
  backendOrm: 'SQLModel',
  backendDatabase: 'SQLite',
  backendMigrations: 'Alembic',
  backendAuth: 'JWT por roles',
  backendTesting: 'pytest + httpx',
  frontendFramework: 'React + Vite',
  frontendLanguage: 'TypeScript',
  frontendUi: 'Bootstrap 5',
  frontendRouting: 'React Router',
  frontendDataFetching: 'TanStack Query + Axios',
  frontendState: 'Zustand para sesion y filtros',
  frontendTesting: 'Vitest + pruebas UI basicas',
  runMode: 'Local development',
  envVars: ['DATABASE_URL', 'JWT_SECRET_KEY', 'CORS_ORIGINS'],
  seedAdmin: 'admin@hotel.local / cambiar password al primer inicio',
  commands: [
    'backend: uvicorn app.main:app --reload',
    'frontend: npm run dev',
    'migrations: alembic upgrade head',
    'tests: pytest'
  ]
};

const dataEntities = [
  {
    id: 'entity-guest',
    name: 'Guest',
    tableName: 'guests',
    description: 'Huesped registrado con datos de contacto e historial de estancias.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '1', 'PK'),
      field('full_name', 'string', true, false, false, '', 'Maria Perez', 'Nombre del huesped'),
      field('email', 'string', false, false, true, '', 'maria@example.com', 'Correo de contacto'),
      field('phone', 'string', false, false, true, '', '+52 614 000 0000', 'Telefono'),
      field('document_id', 'string', false, true, true, '', 'MX-ABC123', 'Identificacion opcional')
    ],
    relationships: [],
    integrityRules: ['document_id unico cuando exista', 'email debe tener formato valido si se captura']
  },
  {
    id: 'entity-room',
    name: 'Room',
    tableName: 'rooms',
    description: 'Habitacion administrable por estado operativo y tipo.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '12', 'PK'),
      field('number', 'string', true, true, false, '', '204', 'Numero interno'),
      field('type', 'enum', true, false, false, '', 'standard', 'Tipo de habitacion', ['standard', 'double', 'suite']),
      field('status', 'enum', true, false, false, 'available', 'available', 'Estado operativo', ['available', 'occupied', 'cleaning', 'maintenance', 'blocked'])
    ],
    relationships: [],
    integrityRules: ['number unico', 'status solo puede tomar valores permitidos']
  },
  {
    id: 'entity-reservation',
    name: 'Reservation',
    tableName: 'reservations',
    description: 'Reserva con fechas, huesped titular, habitacion asignada y estado.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '1001', 'PK'),
      field('guest_id', 'number', true, false, false, '', '1', 'FK a guests'),
      field('room_id', 'number', false, false, true, '', '12', 'FK a rooms'),
      field('check_in', 'date', true, false, false, '', '2026-06-01', 'Fecha de entrada'),
      field('check_out', 'date', true, false, false, '', '2026-06-03', 'Fecha de salida'),
      field('status', 'enum', true, false, false, 'booked', 'booked', 'Estado de reserva', ['booked', 'checked_in', 'checked_out', 'cancelled', 'no_show'])
    ],
    relationships: [
      rel('Reservation', 'many-to-one', 'Guest', 'guest_id', 'restrict', 'La reserva pertenece a un huesped titular.'),
      rel('Reservation', 'many-to-one', 'Room', 'room_id', 'set null', 'La reserva puede tener habitacion asignada.'),
      rel('Reservation', 'one-to-many', 'Payment', 'reservation_id', 'cascade', 'Una reserva puede tener pagos parciales.')
    ],
    integrityRules: ['check_in < check_out', 'no overlap por room_id en reservas activas']
  },
  {
    id: 'entity-payment',
    name: 'Payment',
    tableName: 'payments',
    description: 'Pago parcial o completo asociado a una reserva.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '5001', 'PK'),
      field('reservation_id', 'number', true, false, false, '', '1001', 'FK a reservations'),
      field('amount', 'number', true, false, false, '', '1200.00', 'Monto pagado'),
      field('method', 'enum', true, false, false, '', 'cash', 'Metodo', ['cash', 'card', 'transfer']),
      field('paid_at', 'datetime', true, false, false, '', '2026-06-01T10:00:00Z', 'Fecha de pago')
    ],
    relationships: [rel('Payment', 'many-to-one', 'Reservation', 'reservation_id', 'cascade', 'Pago asociado a una reserva.')],
    integrityRules: ['amount > 0', 'suma de pagos no debe exceder total salvo ajuste autorizado']
  }
];

const targetRoles = [
  {
    id: 'role-admin',
    name: 'Administrador',
    description: 'Configura usuarios, habitaciones, catalogos y consulta reportes.',
    userType: 'staff',
    permissions: ['rooms.manage', 'users.manage', 'reports.view', 'reservations.cancel_closed'],
    screens: ['/admin/users', '/rooms', '/reports', '/dashboard'],
    endpoints: ['GET /reports/*', 'POST /rooms', 'PATCH /rooms/:id', 'POST /users']
  },
  {
    id: 'role-frontdesk',
    name: 'Recepcionista',
    description: 'Opera reservas, check-in, check-out y cobros del turno.',
    userType: 'staff',
    permissions: ['reservations.manage', 'checkin.perform', 'checkout.perform', 'payments.create'],
    screens: ['/reservations', '/calendar', '/front-desk', '/payments'],
    endpoints: ['POST /reservations', 'PATCH /reservations/:id/check-in', 'PATCH /reservations/:id/check-out', 'POST /payments']
  },
  {
    id: 'role-housekeeping',
    name: 'Limpieza',
    description: 'Actualiza estados de habitaciones y consulta salidas/estancias.',
    userType: 'staff',
    permissions: ['rooms.status_update', 'rooms.view'],
    screens: ['/housekeeping'],
    endpoints: ['GET /rooms', 'PATCH /rooms/:id/status']
  },
  {
    id: 'role-manager',
    name: 'Gerente',
    description: 'Consulta indicadores, ocupacion e ingresos.',
    userType: 'staff',
    permissions: ['dashboard.view', 'reports.view'],
    screens: ['/dashboard', '/reports'],
    endpoints: ['GET /dashboard', 'GET /reports/*']
  }
];

const requirements = [
  req('REQ-0001', 'functional', 'critical', 'El sistema debe permitir registrar, modificar y cancelar reservaciones con fechas de entrada/salida, huesped titular, estado y habitacion asignada.', 'Crear reserva retorna 201; check_in es menor que check_out; no permite solapamientos de habitacion; cancelar reserva cerrada requiere rol Administrador.', 0, {
    screenName: 'Reservaciones',
    routePath: '/reservations',
    endpointMethod: 'POST',
    endpointPath: '/reservations',
    requestFields: [fieldSpec('guest_id', 'number', true), fieldSpec('room_id', 'number', false), fieldSpec('check_in', 'date', true), fieldSpec('check_out', 'date', true)],
    responseFields: [fieldSpec('id', 'number', true), fieldSpec('status', 'string', true)],
    businessRules: ['No debe existir reserva activa solapada por habitacion.', 'Solo Administrador puede cancelar reservas cerradas.'],
    validations: ['check_in < check_out', 'guest_id debe existir', 'room_id debe existir si se envia'],
    expectedErrors: [errorSpec(409, 'Habitacion ocupada en el rango solicitado', 'Room is not available'), errorSpec(422, 'Fechas invalidas', 'check_in must be before check_out')],
    permissions: ['reservations.manage'],
    acceptanceChecks: ['Crear reserva valida', 'Rechazar solapamiento', 'Cancelar reserva abierta'],
    testCases: ['POST /reservations happy path', 'POST /reservations overlap returns 409']
  }),
  req('REQ-0002', 'functional', 'critical', 'El sistema debe ejecutar check-in y check-out actualizando estado de reserva, ocupacion y estado de habitacion de forma automatica.', 'Check-in cambia reserva a checked_in y habitacion a occupied; check-out cambia reserva a checked_out y habitacion a cleaning o available segun politica.', 1, {
    screenName: 'Front Desk',
    routePath: '/front-desk',
    endpointMethod: 'PATCH',
    endpointPath: '/reservations/{id}/check-in',
    requestFields: [fieldSpec('reservation_id', 'number', true), fieldSpec('confirmed_balance', 'boolean', true)],
    responseFields: [fieldSpec('reservation_id', 'number', true), fieldSpec('room_status', 'string', true)],
    businessRules: ['No permitir check-in si existe saldo vencido.', 'Check-out libera la habitacion para limpieza.'],
    validations: ['La reserva debe estar booked para check-in', 'La reserva debe estar checked_in para check-out'],
    expectedErrors: [errorSpec(409, 'Saldo vencido o reserva en estado incorrecto', 'Reservation cannot be checked in')],
    permissions: ['checkin.perform', 'checkout.perform'],
    acceptanceChecks: ['Check-in actualiza reserva y habitacion', 'Check-out libera habitacion'],
    testCases: ['PATCH check-in happy path', 'PATCH check-out happy path']
  }),
  req('REQ-0003', 'functional', 'high', 'El sistema debe administrar habitaciones, tipos y estados operativos para recepcion y limpieza.', 'Alta/edicion/baja logica de habitacion disponible; estados restringidos a disponible, ocupada, limpieza, mantenimiento y bloqueada.', 2, {
    screenName: 'Habitaciones',
    routePath: '/rooms',
    endpointMethod: 'PATCH',
    endpointPath: '/rooms/{id}/status',
    requestFields: [fieldSpec('status', 'enum', true, ['available', 'occupied', 'cleaning', 'maintenance', 'blocked'])],
    responseFields: [fieldSpec('id', 'number', true), fieldSpec('status', 'string', true)],
    businessRules: ['Limpieza solo puede cambiar estado operativo, no modificar tarifas ni reservas.'],
    validations: ['status debe estar en catalogo permitido', 'room number unico'],
    expectedErrors: [errorSpec(403, 'Rol sin permiso para cambiar estado', 'Forbidden'), errorSpec(422, 'Estado invalido', 'Invalid room status')],
    permissions: ['rooms.manage', 'rooms.status_update'],
    acceptanceChecks: ['Cambiar estado desde limpieza', 'Administrador edita datos de habitacion'],
    testCases: ['PATCH /rooms/:id/status with housekeeping role']
  }),
  req('REQ-0004', 'functional', 'high', 'El sistema debe registrar pagos parciales o completos y calcular saldos pendientes por reserva.', 'Pago con monto positivo queda asociado a reserva; dashboard y detalle muestran saldo pendiente actualizado.', 3, {
    screenName: 'Cobros',
    routePath: '/payments',
    endpointMethod: 'POST',
    endpointPath: '/payments',
    requestFields: [fieldSpec('reservation_id', 'number', true), fieldSpec('amount', 'number', true), fieldSpec('method', 'enum', true, ['cash', 'card', 'transfer'])],
    responseFields: [fieldSpec('id', 'number', true), fieldSpec('balance_due', 'number', true)],
    businessRules: ['El pago puede ser parcial o completo.', 'No permitir monto menor o igual a cero.'],
    validations: ['amount > 0', 'reservation_id debe existir'],
    expectedErrors: [errorSpec(422, 'Monto invalido', 'amount must be greater than zero')],
    permissions: ['payments.create'],
    acceptanceChecks: ['Registrar pago parcial', 'Actualizar saldo pendiente'],
    testCases: ['POST /payments partial payment updates balance']
  }),
  req('REQ-0005', 'functional', 'medium', 'El sistema debe generar reportes y dashboard de ocupacion, reservas activas, ingresos y habitaciones disponibles.', 'Dashboard muestra metricas del dia y reportes exportables por periodo.', 4, {
    screenName: 'Dashboard',
    routePath: '/dashboard',
    endpointMethod: 'GET',
    endpointPath: '/dashboard/summary',
    requestFields: [fieldSpec('from', 'date', false), fieldSpec('to', 'date', false)],
    responseFields: [fieldSpec('occupancy_rate', 'number', true), fieldSpec('active_reservations', 'number', true), fieldSpec('revenue', 'number', true)],
    businessRules: ['Ingresos deben considerar pagos registrados en el periodo.', 'Ocupacion se calcula con habitaciones occupied sobre habitaciones activas.'],
    validations: ['from <= to si se envian fechas'],
    expectedErrors: [errorSpec(401, 'Usuario no autenticado', 'Unauthorized')],
    permissions: ['dashboard.view', 'reports.view'],
    acceptanceChecks: ['Dashboard carga metricas', 'Reporte filtra por periodo'],
    testCases: ['GET /dashboard/summary returns expected counters']
  })
];

function field(name, type, required, unique, nullable, defaultValue, example, description, enumValues) {
  return { name, type, required, unique, nullable, defaultValue, example, description, enumValues };
}

function rel(fromEntity, type, toEntity, foreignKey, onDelete, description) {
  return { fromEntity, type, toEntity, foreignKey, onDelete, description };
}

function fieldSpec(name, type, required, enumValues) {
  return { name, type, required, description: '', example: '', enumValues: Array.isArray(enumValues) ? enumValues : undefined };
}

function errorSpec(statusCode, condition, message) {
  return { statusCode, condition, message };
}

function req(code, type, priority, description, acceptanceCriteria, findingIndex, contract) {
  return { code, type, priority, description, acceptanceCriteria, findingIndex, contract };
}

function normalizeText(value) {
  return String(value || '').replace(/[^\x00-\x7F]/g, (char) => {
    const map = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
    return map[char] || char;
  });
}

async function insertSession(client, projectId, definition, stakeholderIds, processId = null, subprocessId = null, metadata = {}) {
  const result = await client.query(
    `INSERT INTO trace_sessions
      (project_id, technique, technique_code, discovery_type, status, title, notes, process_id, subprocess_id, metadata, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING id`,
    [
      projectId,
      definition.technique,
      definition.techniqueCode,
      definition.discoveryType,
      'completed',
      definition.title,
      definition.notes,
      processId,
      subprocessId,
      JSON.stringify(metadata),
      definition.occurredAt
    ]
  );
  const sessionId = result.rows[0].id;
  for (const stakeholderId of stakeholderIds) {
    await client.query(
      `INSERT INTO trace_session_stakeholders (session_id, stakeholder_id)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [sessionId, stakeholderId]
    );
  }
  for (const evidence of definition.evidences) {
    await client.query(
      `INSERT INTO trace_evidences (session_id, kind, file_name, mime_type, size_bytes, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sessionId, evidence.kind, evidence.fileName || null, evidence.mimeType || null, evidence.sizeBytes || null, evidence.notes]
    );
  }
  return sessionId;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM projects WHERE name = $1`, [PROJECT_NAME]);

    const projectResult = await client.query(
      `INSERT INTO projects (name, objective, scope, description, start_date, end_date)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE + INTERVAL '90 days')
       RETURNING id`,
      [
        PROJECT_NAME,
        'Disenar, desarrollar e implementar un PMS para hoteles pequenos que digitalice reservas, huespedes, habitaciones, cobros, ocupacion y reportes operativos.',
        'Incluye reservaciones, habitaciones, huespedes, check-in/check-out, cobros, dashboard, usuarios, roles y auditoria basica. Excluye OTAs, facturacion fiscal, motor publico, app movil y revenue management avanzado.',
        normalizeText('Proyecto demo generado desde alcance PMS y checklists OPERA Cloud AM/PM/Night Audit para probar specs implementables en Specora.')
      ]
    );
    const projectId = projectResult.rows[0].id;

    const users = await client.query('SELECT id FROM users ORDER BY id');
    for (const user of users.rows) {
      await client.query(
        `INSERT INTO project_users (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [projectId, user.id]
      );
    }

    const stakeholderDefs = [
      ['Laura Martinez', 'Gerente General', 'external', 'laura@hotel-demo.local'],
      ['Roberto Sanchez', 'Recepcionista AM', 'external', 'roberto.am@hotel-demo.local'],
      ['Diana Torres', 'Recepcionista PM', 'external', 'diana.pm@hotel-demo.local'],
      ['Miguel Rios', 'Auditor Nocturno', 'external', 'miguel.audit@hotel-demo.local'],
      ['Elena Gomez', 'Supervisora de Limpieza', 'external', 'elena.housekeeping@hotel-demo.local'],
      ['Ana Analista', 'Analista de Negocio', 'internal', 'ana.analista@graficacion.local']
    ];
    const stakeholderIds = {};
    for (const [name, role, type, contact] of stakeholderDefs) {
      const result = await client.query(
        `INSERT INTO trace_stakeholders (project_id, name, role, type, contact)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [projectId, name, role, type, contact]
      );
      stakeholderIds[role] = result.rows[0].id;
    }

    const processDefs = [
      {
        name: 'Gestion de reservaciones',
        description: 'Flujo desde consulta de disponibilidad hasta confirmacion, modificacion o cancelacion de reserva.',
        subprocesses: [
          ['Consulta de disponibilidad', 'Validar fechas, ocupacion y tipo de habitacion.'],
          ['Registro de reserva', 'Capturar huesped, fechas, habitacion, canal y estado.'],
          ['Modificacion o cancelacion', 'Actualizar reserva con permisos y reglas de negocio.']
        ]
      },
      {
        name: 'Operacion de front desk',
        description: 'Ejecucion diaria de check-in, check-out, pagos, comunicacion de turno y control de ocupacion.',
        subprocesses: [
          ['Check-in', 'Validar reserva, saldo, identidad y asignacion de habitacion.'],
          ['Check-out', 'Cerrar estancia, cobrar saldos y liberar habitacion.'],
          ['Cambio de habitacion', 'Registrar traslado y comunicar a limpieza.']
        ]
      },
      {
        name: 'Control de habitaciones y limpieza',
        description: 'Mantenimiento del estado operativo de habitaciones y coordinacion con recepcion.',
        subprocesses: [
          ['Actualizacion de estado', 'Marcar disponible, ocupada, limpieza, mantenimiento o bloqueada.'],
          ['Comunicacion de late checkouts', 'Notificar salidas tardias y stay-overs a limpieza.']
        ]
      },
      {
        name: 'Cierre de turno y auditoria nocturna',
        description: 'Balance de caja, validacion de pendientes, reportes de downtime y cierre del dia.',
        subprocesses: [
          ['Balance de caja', 'Comparar movimientos registrados contra efectivo y comprobantes.'],
          ['Night audit', 'Ejecutar cierre del dia y validar reportes operativos.'],
          ['Reportes operativos', 'Generar ocupacion, ingresos, llegadas, salidas y alertas.']
        ]
      }
    ];

    const processIds = {};
    const subprocessIds = {};
    for (const process of processDefs) {
      const processResult = await client.query(
        `INSERT INTO processes (project_id, name, description) VALUES ($1,$2,$3) RETURNING id`,
        [projectId, process.name, process.description]
      );
      processIds[process.name] = processResult.rows[0].id;
      for (const [name, description] of process.subprocesses) {
        const subprocessResult = await client.query(
          `INSERT INTO subprocesses (process_id, name, description) VALUES ($1,$2,$3) RETURNING id`,
          [processResult.rows[0].id, name, description]
        );
        subprocessIds[name] = subprocessResult.rows[0].id;
      }
    }

    const sessions = [
      {
        key: 'interview-manager',
        stakeholderRoles: ['Gerente General'],
        process: 'Gestion de reservaciones',
        subprocess: 'Registro de reserva',
        definition: {
          technique: 'Entrevista',
          techniqueCode: 'interview',
          discoveryType: 'direct',
          title: 'Entrevista con gerencia sobre operacion PMS',
          occurredAt: '2026-05-01T10:00:00Z',
          notes: 'Sesion sintetica basada en alcance PMS. La gerencia prioriza reducir Excel duplicado, errores de ocupacion y falta de reportes diarios.',
          evidences: [
            { kind: 'transcript', fileName: 'entrevista-gerencia-pms.txt', mimeType: 'text/plain', notes: 'Transcripcion sintetica: dolor principal es duplicidad entre recepcion, caja y limpieza.' }
          ]
        }
      },
      {
        key: 'observation-frontdesk',
        stakeholderRoles: ['Recepcionista AM'],
        process: 'Operacion de front desk',
        subprocess: 'Check-in',
        definition: {
          technique: 'Observacion',
          techniqueCode: 'observation',
          discoveryType: 'direct',
          title: 'Observacion de check-in AM',
          occurredAt: '2026-05-02T15:00:00Z',
          notes: 'Se observo recepcion operando con hoja Excel paralela para disponibilidad y pagos, usando checklist AM como referencia operativa.',
          evidences: [
            { kind: 'file', fileName: 'OPERA Cloud - AM Shift Checklist.pdf', mimeType: 'application/pdf', sizeBytes: 108774, notes: 'Checklist AM usado como evidencia documental de pasos de turno.' },
            { kind: 'note', fileName: 'observacion-checkin-am.md', mimeType: 'text/markdown', notes: 'Nota: validacion de llegadas, asignacion de habitaciones y comunicacion con limpieza se hacen en herramientas separadas.' }
          ]
        }
      },
      {
        key: 'focus-frontdesk',
        stakeholderRoles: ['Recepcionista AM', 'Recepcionista PM', 'Auditor Nocturno'],
        process: 'Operacion de front desk',
        subprocess: 'Check-out',
        definition: {
          technique: 'Focus Group',
          techniqueCode: 'focus_group',
          discoveryType: 'direct',
          title: 'Focus group con recepcion por turnos',
          occurredAt: '2026-05-03T18:00:00Z',
          notes: 'Sesion sintetica: se compararon actividades AM, PM y Night Audit. Coinciden en necesidad de checklist digital, handoff entre turnos y control de caja.',
          evidences: [
            { kind: 'transcript', fileName: 'focus-recepcion-turnos.txt', mimeType: 'text/plain', notes: 'Participantes reportan que los saldos y estados de habitacion se verifican manualmente.' },
            { kind: 'file', fileName: 'OPERA Cloud - PM Shift Checklist.pdf', mimeType: 'application/pdf', sizeBytes: 128779, notes: 'Checklist PM aporta pasos de pre-bloqueo, depositos, routing y cierre de cajero.' }
          ]
        }
      },
      {
        key: 'document-analysis',
        stakeholderRoles: ['Analista de Negocio'],
        process: 'Cierre de turno y auditoria nocturna',
        subprocess: 'Night audit',
        definition: {
          technique: 'Analisis Documental',
          techniqueCode: 'document_analysis',
          discoveryType: 'indirect',
          title: 'Analisis documental de checklists OPERA Cloud',
          occurredAt: '2026-05-04T12:00:00Z',
          notes: 'Se revisaron checklists AM, PM y Night Audit para extraer procesos dentro del alcance del PMS pequeno.',
          evidences: [
            { kind: 'file', fileName: 'OPERA Cloud - Night Audit Checklist.pdf', mimeType: 'application/pdf', sizeBytes: 202458, notes: 'Checklist Night Audit: cash drawer, due outs, arrivals expected, downtime reports, bucket check, cashier close, audit.' },
            { kind: 'file', fileName: 'OPERA Cloud - PM Shift Checklist.pdf', mimeType: 'application/pdf', sizeBytes: 128779, notes: 'Checklist PM: review arrivals, room assignment, deposits, routing, credit limit report, close cashier.' },
            { kind: 'file', fileName: 'OPERA Cloud - AM Shift Checklist.pdf', mimeType: 'application/pdf', sizeBytes: 108774, notes: 'Checklist AM: arrivals, deposits, OTA emails, housekeeping communication, due outs and cashier close.' }
          ]
        }
      },
      {
        key: 'tracking-reservation',
        stakeholderRoles: ['Recepcionista PM'],
        process: 'Gestion de reservaciones',
        subprocess: 'Registro de reserva',
        metadata: {
          transactionId: 'RSV-DEMO-2026-001',
          transactionType: 'Reserva directa telefonica',
          startedAt: '2026-05-05T20:10:00Z',
          completedAt: '2026-05-05T20:31:00Z',
          finalStatus: 'confirmada_con_pago_pendiente',
          primaryActorId: null,
          systemsInvolved: ['Telefono', 'Excel', 'Comprobante interno'],
          objective: 'Seguir una reserva realista desde llamada hasta confirmacion para detectar duplicidad y validaciones faltantes.',
          realFlowSummary: 'La recepcionista consulta disponibilidad en Excel, registra datos del huesped, asigna habitacion y anota saldo pendiente en otra hoja.',
          steps: [
            { order: 1, name: 'Cliente solicita habitacion', actorRole: 'Huesped', channel: 'Telefono', input: 'Fechas y numero de personas', action: 'Solicita disponibilidad', output: 'Datos preliminares', duration: '3 min', issue: 'Datos incompletos al primer contacto' },
            { order: 2, name: 'Recepcion consulta disponibilidad', actorStakeholderId: null, actorRole: 'Recepcionista', system: 'Excel', input: 'Fechas', action: 'Busca disponibilidad manualmente', output: 'Habitacion candidata', duration: '7 min', issue: 'Riesgo de solapamiento por hoja no actualizada' },
            { order: 3, name: 'Registro de reserva', actorRole: 'Recepcionista', system: 'Excel', input: 'Datos del huesped', action: 'Captura reserva y saldo', output: 'Reserva confirmada', duration: '8 min', issue: 'Duplicidad entre disponibilidad, saldo y datos del huesped' },
            { order: 4, name: 'Confirmacion al cliente', actorRole: 'Recepcionista', channel: 'Telefono', input: 'Reserva registrada', action: 'Comunica condiciones y pago pendiente', output: 'Cliente acepta', duration: '3 min' }
          ],
          problems: [
            { stepOrder: 2, description: 'La disponibilidad se valida manualmente en Excel, generando riesgo de sobreventa.', severity: 'high', impact: 'Reserva solapada o habitacion duplicada.' },
            { stepOrder: 3, description: 'El saldo pendiente queda separado de la reserva y puede omitirse en check-in.', severity: 'medium', impact: 'Errores de cobro y conciliacion.' }
          ],
          metrics: { totalTime: '21 min', targetTime: '8 min', deviation: '+162%', reworkCount: 2, manualStepCount: 4, informalApprovalCount: 1 }
        },
        definition: {
          technique: 'Seguimiento Transaccional',
          techniqueCode: 'transaction_tracking',
          discoveryType: 'direct',
          title: 'Seguimiento transaccional de reserva telefonica RSV-DEMO-2026-001',
          occurredAt: '2026-05-05T20:10:00Z',
          notes: 'Seguimiento sintetico de una reserva directa para observar flujo real contra proceso esperado.',
          evidences: [
            { kind: 'note', fileName: 'seguimiento-rsv-demo-2026-001.md', mimeType: 'text/markdown', notes: 'Recorrido paso a paso con tiempos, sistemas, problemas y metricas.' }
          ]
        }
      },
      {
        key: 'survey-staff',
        stakeholderRoles: ['Recepcionista AM', 'Recepcionista PM', 'Supervisora de Limpieza'],
        process: 'Control de habitaciones y limpieza',
        subprocess: 'Actualizacion de estado',
        definition: {
          technique: 'Encuesta',
          techniqueCode: 'survey',
          discoveryType: 'self_managed',
          title: 'Encuesta rapida de estados de habitacion',
          occurredAt: '2026-05-06T11:00:00Z',
          notes: 'Encuesta sintetica a usuarios operativos sobre frecuencia de errores, estados usados y comunicacion recepcion-limpieza.',
          evidences: [
            { kind: 'note', fileName: 'encuesta-estados-habitacion.md', mimeType: 'text/markdown', notes: 'Resultado sintetico: estado limpieza/mantenimiento no siempre se actualiza a tiempo.' }
          ]
        }
      }
    ];

    const sessionIds = {};
    for (const item of sessions) {
      const stakeholderList = item.stakeholderRoles.map((role) => stakeholderIds[role]).filter(Boolean);
      sessionIds[item.key] = await insertSession(
        client,
        projectId,
        item.definition,
        stakeholderList,
        processIds[item.process],
        subprocessIds[item.subprocess],
        item.metadata || {}
      );
    }

    const findingDefs = [
      ['interview-manager', 'problem', 'El hotel opera disponibilidad, huespedes y saldos en hojas separadas, provocando duplicidad y baja confianza en la ocupacion real.'],
      ['observation-frontdesk', 'need', 'Recepcion necesita registrar check-in y check-out en un flujo unico que actualice reserva, habitacion y comunicacion con limpieza.'],
      ['survey-staff', 'need', 'El equipo de limpieza requiere actualizar estados de habitacion sin depender de llamadas o notas manuales de recepcion.'],
      ['focus-frontdesk', 'problem', 'Los pagos parciales y saldos pendientes se verifican al cierre de turno de forma manual, con riesgo de omisiones.'],
      ['document-analysis', 'need', 'Los checklists AM, PM y Night Audit evidencian necesidad de reportes operativos diarios y cierre de caja trazable.'],
      ['tracking-reservation', 'problem', 'El seguimiento de reserva telefonica mostro riesgo de solapamiento y tiempo excesivo por validacion manual de disponibilidad.']
    ];
    const findingIds = [];
    for (const [sessionKey, category, statement] of findingDefs) {
      const result = await client.query(
        `INSERT INTO trace_findings (session_id, category, statement)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [sessionIds[sessionKey], category, statement]
      );
      findingIds.push(result.rows[0].id);
    }

    const implementationContracts = [];
    const requirementIds = [];
    for (const item of requirements) {
      const result = await client.query(
        `INSERT INTO trace_requirements (project_id, code, type, priority, description, acceptance_criteria)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [projectId, item.code, item.type, item.priority, item.description, item.acceptanceCriteria]
      );
      const requirementId = result.rows[0].id;
      requirementIds.push(requirementId);
      await client.query(
        `INSERT INTO trace_requirement_findings (requirement_id, finding_id) VALUES ($1,$2)`,
        [requirementId, findingIds[item.findingIndex]]
      );
      implementationContracts.push({
        requirementId,
        useCaseId: null,
        ...item.contract
      });
    }

    const useCases = [
      [0, 'Registrar una reservacion', 'Recepcionista', 'registrar una reserva con disponibilidad validada', 'evitar sobreventas y confirmar al huesped'],
      [1, 'Realizar check-in y check-out', 'Recepcionista', 'ejecutar entrada y salida desde una reserva', 'mantener ocupacion y habitaciones actualizadas'],
      [2, 'Actualizar estado de habitacion', 'Limpieza', 'cambiar el estado operativo de una habitacion', 'coordinar recepcion y limpieza sin llamadas manuales'],
      [3, 'Registrar pago parcial o completo', 'Recepcionista', 'registrar un pago asociado a una reserva', 'controlar saldos y cierre de caja'],
      [4, 'Consultar dashboard operativo', 'Gerente', 'ver ocupacion, reservas e ingresos del periodo', 'tomar decisiones con informacion actualizada']
    ];
    for (const [index, title, actor, action, benefit] of useCases) {
      const result = await client.query(
        `INSERT INTO trace_use_cases (project_id, requirement_id, title, actor, action, benefit, acceptance_criteria)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [projectId, requirementIds[index], title, actor, action, benefit, requirements[index].acceptanceCriteria]
      );
      implementationContracts[index].useCaseId = result.rows[0].id;
    }

    await client.query(
      `INSERT INTO project_implementation_inputs
       (project_id, target_stack, implementation_contracts, data_entities, target_roles)
       VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)
       ON CONFLICT (project_id)
       DO UPDATE SET target_stack = EXCLUDED.target_stack,
                     implementation_contracts = EXCLUDED.implementation_contracts,
                     data_entities = EXCLUDED.data_entities,
                     target_roles = EXCLUDED.target_roles,
                     updated_at = NOW()`,
      [projectId, JSON.stringify(targetStack), JSON.stringify(implementationContracts), JSON.stringify(dataEntities), JSON.stringify(targetRoles)]
    );

    await client.query('COMMIT');
    console.log(`Demo PMS creado correctamente. project_id=${projectId}`);
    console.log(`Abre Specora y busca: ${PROJECT_NAME}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
