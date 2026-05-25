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
    id: 'entity-room-type',
    name: 'RoomType',
    tableName: 'room_types',
    description: 'Catalogo de tipos de habitacion, capacidad base y configuracion comercial.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '1', 'PK'),
      field('code', 'string', true, true, false, '', 'STD', 'Codigo del tipo'),
      field('name', 'string', true, false, false, '', 'Standard King', 'Nombre comercial'),
      field('base_occupancy', 'number', true, false, false, '2', '2', 'Capacidad base'),
      field('max_occupancy', 'number', true, false, false, '4', '4', 'Capacidad maxima')
    ],
    relationships: [],
    integrityRules: ['code unico', 'base_occupancy <= max_occupancy']
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
      field('room_type_id', 'number', true, false, false, '', '1', 'FK a room_types'),
      field('floor', 'number', false, false, true, '', '2', 'Piso'),
      field('status', 'enum', true, false, false, 'vacant_clean', 'vacant_clean', 'Estado operativo', ['vacant_clean', 'vacant_dirty', 'occupied', 'maintenance', 'blocked', 'inspection_pending'])
    ],
    relationships: [rel('Room', 'many-to-one', 'RoomType', 'room_type_id', 'restrict', 'La habitacion pertenece a un tipo comercial.')],
    integrityRules: ['number unico', 'status solo puede tomar valores permitidos']
  },
  {
    id: 'entity-rate-plan',
    name: 'RatePlan',
    tableName: 'rate_plans',
    description: 'Tarifa comercial aplicable a una reserva por tipo de habitacion, canal y politica.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '10', 'PK'),
      field('code', 'string', true, true, false, '', 'BAR', 'Codigo de tarifa'),
      field('name', 'string', true, false, false, '', 'Best Available Rate', 'Nombre comercial'),
      field('room_type_id', 'number', true, false, false, '', '1', 'FK a room_types'),
      field('currency', 'string', true, false, false, 'MXN', 'MXN', 'Moneda'),
      field('base_nightly_rate', 'number', true, false, false, '', '1800.00', 'Tarifa base por noche'),
      field('is_refundable', 'boolean', true, false, false, 'true', 'true', 'Politica de reembolso')
    ],
    relationships: [rel('RatePlan', 'many-to-one', 'RoomType', 'room_type_id', 'restrict', 'La tarifa pertenece a un tipo de habitacion.')],
    integrityRules: ['code unico', 'base_nightly_rate > 0']
  },
  {
    id: 'entity-reservation',
    name: 'Reservation',
    tableName: 'reservations',
    description: 'Reserva con folio, tarifa, fechas, huesped titular, habitacion asignada y estado operativo.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '1001', 'PK'),
      field('reservation_number', 'string', true, true, false, '', 'RSV-2026-0001', 'Folio visible de reserva'),
      field('guest_id', 'number', true, false, false, '', '1', 'FK a guests'),
      field('room_type_id', 'number', true, false, false, '', '1', 'FK a room_types'),
      field('room_id', 'number', false, false, true, '', '12', 'FK a rooms'),
      field('rate_plan_id', 'number', true, false, false, '', '10', 'FK a rate_plans'),
      field('nightly_rate', 'number', true, false, false, '', '1800.00', 'Tarifa aplicada por noche'),
      field('adults', 'number', true, false, false, '1', '2', 'Adultos'),
      field('children', 'number', false, false, true, '0', '1', 'Menores'),
      field('check_in', 'date', true, false, false, '', '2026-06-01', 'Fecha de entrada'),
      field('check_out', 'date', true, false, false, '', '2026-06-03', 'Fecha de salida'),
      field('status', 'enum', true, false, false, 'booked', 'booked', 'Estado de reserva', ['draft', 'booked', 'pending_assignment', 'checked_in', 'checked_out', 'cancelled', 'no_show']),
      field('source', 'enum', true, false, false, 'direct', 'direct', 'Canal de reserva', ['direct', 'phone', 'walk_in', 'ota', 'corporate'])
    ],
    relationships: [
      rel('Reservation', 'many-to-one', 'Guest', 'guest_id', 'restrict', 'La reserva pertenece a un huesped titular.'),
      rel('Reservation', 'many-to-one', 'RoomType', 'room_type_id', 'restrict', 'La reserva debe corresponder a un tipo de habitacion.'),
      rel('Reservation', 'many-to-one', 'Room', 'room_id', 'set null', 'La reserva puede tener habitacion asignada.'),
      rel('Reservation', 'many-to-one', 'RatePlan', 'rate_plan_id', 'restrict', 'La reserva debe tener una tarifa aplicada.'),
      rel('Reservation', 'one-to-one', 'Folio', 'reservation_id', 'cascade', 'La reserva genera un folio operativo visible en front desk.')
    ],
    integrityRules: ['check_in < check_out', 'nightly_rate > 0', 'no overlap por room_id en reservas activas', 'room_id puede ser null solo si status = pending_assignment']
  },
  {
    id: 'entity-folio',
    name: 'Folio',
    tableName: 'folios',
    description: 'Cuenta operativa y financiera de la estancia con saldo, cargos y estatus.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '7001', 'PK'),
      field('folio_number', 'string', true, true, false, '', 'FOL-2026-0001', 'Numero visible en front desk y cobros'),
      field('reservation_id', 'number', true, false, false, '', '1001', 'FK a reservations'),
      field('status', 'enum', true, false, false, 'open', 'open', 'Estado del folio', ['open', 'closed', 'disputed']),
      field('balance_due', 'number', true, false, false, '0', '1800.00', 'Saldo pendiente actual'),
      field('currency', 'string', true, false, false, 'MXN', 'MXN', 'Moneda')
    ],
    relationships: [
      rel('Folio', 'one-to-one', 'Reservation', 'reservation_id', 'cascade', 'El folio principal pertenece a una reserva.'),
      rel('Folio', 'one-to-many', 'FolioCharge', 'folio_id', 'cascade', 'El folio contiene cargos y ajustes.'),
      rel('Folio', 'one-to-many', 'Payment', 'folio_id', 'cascade', 'El folio recibe pagos parciales o completos.')
    ],
    integrityRules: ['folio_number unico', 'balance_due >= 0']
  },
  {
    id: 'entity-folio-charge',
    name: 'FolioCharge',
    tableName: 'folio_charges',
    description: 'Cargo individual aplicado al folio por hospedaje, consumo o ajuste.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '9001', 'PK'),
      field('folio_id', 'number', true, false, false, '', '7001', 'FK a folios'),
      field('charge_type', 'enum', true, false, false, '', 'room_rate', 'Tipo de cargo', ['room_rate', 'deposit', 'extra', 'tax', 'adjustment']),
      field('description', 'string', true, false, false, '', 'Nightly room charge', 'Descripcion visible'),
      field('amount', 'number', true, false, false, '', '1800.00', 'Monto del cargo'),
      field('posted_at', 'datetime', true, false, false, '', '2026-06-01T15:00:00Z', 'Fecha de registro')
    ],
    relationships: [rel('FolioCharge', 'many-to-one', 'Folio', 'folio_id', 'cascade', 'Cargo asociado al folio.')],
    integrityRules: ['amount != 0']
  },
  {
    id: 'entity-payment',
    name: 'Payment',
    tableName: 'payments',
    description: 'Pago parcial o completo asociado al folio principal de una reserva.',
    source: 'manual',
    confidence: 'alta',
    fields: [
      field('id', 'number', true, true, false, '', '5001', 'PK'),
      field('folio_id', 'number', true, false, false, '', '7001', 'FK a folios'),
      field('amount', 'number', true, false, false, '', '1200.00', 'Monto pagado'),
      field('method', 'enum', true, false, false, '', 'cash', 'Metodo', ['cash', 'card', 'transfer']),
      field('paid_at', 'datetime', true, false, false, '', '2026-06-01T10:00:00Z', 'Fecha de pago')
    ],
    relationships: [rel('Payment', 'many-to-one', 'Folio', 'folio_id', 'cascade', 'Pago asociado al folio operativo.')],
    integrityRules: ['amount > 0', 'suma de pagos no debe exceder saldo salvo ajuste autorizado']
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
    permissions: ['reservations.manage', 'checkin.perform', 'checkout.perform', 'payments.create', 'folios.view', 'folios.charge_post'],
    screens: ['/reservations', '/calendar', '/front-desk', '/payments', '/folios', '/guests'],
    endpoints: ['POST /reservations', 'PATCH /reservations/:id/check-in', 'PATCH /reservations/:id/check-out', 'POST /payments', 'GET /folios/:id', 'POST /folios/:id/charges']
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
  req('REQ-0001', 'functional', 'critical', 'El sistema debe permitir registrar, modificar y cancelar reservaciones con fechas de entrada/salida, huesped titular, tipo de habitacion, tarifa aplicada, monto por noche, estado y habitacion asignada.', 'Crear reserva retorna 201; check_in es menor que check_out; no permite solapamientos de habitacion; exige tarifa aplicada; reserva sin habitacion solo si queda en pending_assignment.', 0, {
    screenName: 'Reservaciones',
    routePath: '/reservations',
    endpointMethod: 'POST',
    endpointPath: '/reservations',
    requestFields: [
      fieldSpec('guest_id', 'number', true),
      fieldSpec('guest_payload', 'object', false),
      fieldSpec('room_type_id', 'number', true),
      fieldSpec('room_id', 'number', false),
      fieldSpec('rate_plan_id', 'number', true),
      fieldSpec('nightly_rate', 'number', true),
      fieldSpec('check_in', 'date', true),
      fieldSpec('check_out', 'date', true),
      fieldSpec('adults', 'number', true),
      fieldSpec('children', 'number', false),
      fieldSpec('source', 'enum', true, ['direct', 'phone', 'walk_in', 'ota', 'corporate']),
      fieldSpec('notes', 'string', false)
    ],
    responseFields: [
      fieldSpec('id', 'number', true),
      fieldSpec('reservation_number', 'string', true),
      fieldSpec('folio_number', 'string', true),
      fieldSpec('status', 'string', true),
      fieldSpec('estimated_total', 'number', true),
      fieldSpec('room_assignment_required', 'boolean', true)
    ],
    businessRules: [
      'No debe existir reserva activa solapada por habitacion.',
      'La reserva debe tener tarifa y nightly_rate al confirmarse.',
      'Solo Administrador puede cancelar reservas cerradas.',
      'Toda reserva confirmada debe generar reservation_number unico y folio operativo trazable.',
      'Si no hay room_id, el estado inicial permitido es pending_assignment.',
      'La tarifa debe corresponder al room_type seleccionado.'
    ],
    validations: [
      'check_in < check_out',
      'guest_id debe existir o guest_payload debe traer alta rapida valida',
      'rate_plan_id debe existir',
      'nightly_rate > 0',
      'room_id debe existir si se envia',
      'adults >= 1',
      'children >= 0',
      'source debe pertenecer al catalogo permitido'
    ],
    expectedErrors: [
      errorSpec(409, 'Habitacion ocupada en el rango solicitado', 'Room is not available'),
      errorSpec(409, 'La tarifa no corresponde al tipo de habitacion o canal', 'Rate plan is not valid for selected room type'),
      errorSpec(422, 'Fechas invalidas', 'check_in must be before check_out'),
      errorSpec(422, 'Falta tarifa aplicada', 'rate_plan_id is required'),
      errorSpec(422, 'Ocupacion invalida', 'adults must be greater than zero')
    ],
    permissions: ['reservations.manage'],
    acceptanceChecks: [
      'Crear reserva valida con tarifa',
      'Rechazar solapamiento',
      'Generar reservation_number y folio_number',
      'Permitir pending_assignment sin room_id',
      'Cancelar reserva abierta'
    ],
    testCases: [
      'POST /reservations happy path',
      'POST /reservations overlap returns 409',
      'POST /reservations without rate_plan returns 422',
      'POST /reservations with pending_assignment returns 201'
    ]
  }),
  req('REQ-0002', 'functional', 'critical', 'El modulo de Front Desk debe mostrar cada reserva activa con reservation number, folio number, huesped, habitacion, fechas, estado, saldo pendiente y acciones rapidas operativas.', 'Front Desk lista llegadas, in-house y salidas; cada fila muestra reservation_number y folio_number; permite abrir folio, check-in, check-out y cambio de habitacion.', 1, {
    screenName: 'Front Desk',
    routePath: '/front-desk',
    endpointMethod: 'GET',
    endpointPath: '/front-desk/board',
    requestFields: [fieldSpec('status', 'string', false), fieldSpec('date', 'date', false)],
    responseFields: [
      fieldSpec('reservation_number', 'string', true),
      fieldSpec('folio_number', 'string', true),
      fieldSpec('guest_name', 'string', true),
      fieldSpec('room_number', 'string', false),
      fieldSpec('balance_due', 'number', true),
      fieldSpec('status', 'string', true),
      fieldSpec('rate_plan_name', 'string', true),
      fieldSpec('arrival_date', 'date', true),
      fieldSpec('departure_date', 'date', true),
      fieldSpec('quick_actions', 'array', true)
    ],
    businessRules: [
      'Front desk no debe ocultar el folio de la reserva.',
      'Las acciones rapidas deben depender del estado actual de la reserva.',
      'Las reservas pending_assignment deben ser visibles como riesgo operativo.',
      'La vista debe priorizar llegadas, in-house y salidas del dia.'
    ],
    validations: [
      'Solo usuarios de front desk y gerencia pueden consultar el tablero operativo.',
      'Los filtros permitidos son arrivals_today, in_house, departures_today y pending_assignment.'
    ],
    expectedErrors: [
      errorSpec(401, 'Usuario no autenticado', 'Unauthorized'),
      errorSpec(403, 'Rol sin permiso para consultar el tablero operativo', 'Forbidden')
    ],
    permissions: ['reservations.manage', 'checkin.perform', 'checkout.perform', 'folios.view'],
    acceptanceChecks: [
      'Front desk muestra reservation_number y folio_number',
      'Front desk muestra balance pendiente',
      'Front desk muestra tarifa y fechas',
      'Acciones rapidas cambian segun estado'
    ],
    testCases: [
      'GET /front-desk/board returns operational cards with folio and balance',
      'GET /front-desk/board filtered by arrivals_today'
    ]
  }),
  req('REQ-0003', 'functional', 'critical', 'El sistema debe ejecutar check-in y check-out actualizando estado de reserva, ocupacion, folio y estado de habitacion de forma automatica.', 'Check-in cambia reserva a checked_in y habitacion a occupied; check-out cambia reserva a checked_out y habitacion a vacant_dirty o inspection_pending segun politica; no permite salida con saldo no autorizado.', 2, {
    screenName: 'Front Desk',
    routePath: '/front-desk',
    endpointMethod: 'PATCH',
    endpointPath: '/reservations/{id}/check-in',
    requestFields: [
      fieldSpec('reservation_id', 'number', true),
      fieldSpec('confirmed_balance', 'boolean', true),
      fieldSpec('room_id', 'number', false),
      fieldSpec('deposit_amount', 'number', false),
      fieldSpec('override_reason', 'string', false)
    ],
    responseFields: [
      fieldSpec('reservation_id', 'number', true),
      fieldSpec('room_status', 'string', true),
      fieldSpec('folio_number', 'string', true),
      fieldSpec('reservation_status', 'string', true),
      fieldSpec('balance_due', 'number', true)
    ],
    businessRules: [
      'No permitir check-in si existe saldo vencido.',
      'Check-out libera la habitacion para limpieza.',
      'Check-in requiere habitacion asignada.',
      'Check-out debe bloquearse si el folio tiene saldo y no existe override autorizado.',
      'El deposito registrado durante check-in debe reflejarse en el folio inmediatamente.'
    ],
    validations: [
      'La reserva debe estar booked para check-in',
      'La reserva debe estar checked_in para check-out',
      'room_id es obligatoria cuando la reserva esta en pending_assignment',
      'deposit_amount > 0 cuando se captura deposito'
    ],
    expectedErrors: [
      errorSpec(409, 'Saldo vencido o reserva en estado incorrecto', 'Reservation cannot be checked in'),
      errorSpec(409, 'La reserva no puede cerrar con saldo pendiente', 'Reservation cannot be checked out with pending balance'),
      errorSpec(422, 'Falta habitacion asignada', 'Room assignment is required for check-in')
    ],
    permissions: ['checkin.perform', 'checkout.perform'],
    acceptanceChecks: [
      'Check-in actualiza reserva y habitacion',
      'Check-in abre o reutiliza folio',
      'Check-out libera habitacion',
      'Check-out bloquea si hay saldo no autorizado'
    ],
    testCases: [
      'PATCH check-in happy path',
      'PATCH check-in without room assignment returns 422',
      'PATCH check-out happy path',
      'PATCH check-out with pending balance returns 409'
    ]
  }),
  req('REQ-0004', 'functional', 'high', 'El sistema debe administrar habitaciones, tipos y estados operativos para recepcion y limpieza.', 'Alta/edicion/baja logica de habitacion disponible; estados restringidos a vacant_clean, vacant_dirty, occupied, maintenance, blocked e inspection_pending.', 4, {
    screenName: 'Habitaciones',
    routePath: '/rooms',
    endpointMethod: 'PATCH',
    endpointPath: '/rooms/{id}/status',
    requestFields: [
      fieldSpec('status', 'enum', true, ['vacant_clean', 'vacant_dirty', 'occupied', 'maintenance', 'blocked', 'inspection_pending']),
      fieldSpec('reason', 'string', false)
    ],
    responseFields: [fieldSpec('id', 'number', true), fieldSpec('status', 'string', true), fieldSpec('updated_at', 'datetime', true)],
    businessRules: [
      'Limpieza solo puede cambiar estado operativo, no modificar tarifas ni reservas.',
      'Una habitacion blocked o maintenance no debe aparecer en asignacion operativa.',
      'Recepcion debe ver inmediatamente cambios relevantes de limpieza.'
    ],
    validations: [
      'status debe estar en catalogo permitido',
      'room number unico',
      'reason es obligatoria para maintenance o blocked'
    ],
    expectedErrors: [
      errorSpec(403, 'Rol sin permiso para cambiar estado', 'Forbidden'),
      errorSpec(409, 'No se puede mover a occupied sin reserva activa asociada', 'Room cannot be occupied without active stay'),
      errorSpec(422, 'Estado invalido', 'Invalid room status')
    ],
    permissions: ['rooms.manage', 'rooms.status_update'],
    acceptanceChecks: [
      'Cambiar estado desde limpieza',
      'Administrador edita datos de habitacion',
      'Habitacion blocked queda fuera de asignacion'
    ],
    testCases: [
      'PATCH /rooms/:id/status with housekeeping role',
      'PATCH /rooms/:id/status to blocked requires reason'
    ]
  }),
  req('REQ-0005', 'functional', 'critical', 'El sistema debe crear y mantener un folio por reserva, permitiendo registrar cargos de hospedaje, extras y pagos parciales o completos con saldo pendiente visible.', 'Toda reserva confirmada genera folio; front desk y cobros muestran balance_due actualizado; se pueden postear cargos y pagos con trazabilidad.', 3, {
    screenName: 'Folios y Cobros',
    routePath: '/folios/:id',
    endpointMethod: 'POST',
    endpointPath: '/folios/{id}/charges',
    requestFields: [
      fieldSpec('folio_id', 'number', true),
      fieldSpec('charge_type', 'string', true),
      fieldSpec('amount', 'number', true),
      fieldSpec('description', 'string', true),
      fieldSpec('payment_method', 'enum', false, ['cash', 'card', 'transfer']),
      fieldSpec('reference', 'string', false)
    ],
    responseFields: [
      fieldSpec('folio_number', 'string', true),
      fieldSpec('balance_due', 'number', true),
      fieldSpec('status', 'string', true),
      fieldSpec('last_movement_at', 'datetime', true)
    ],
    businessRules: [
      'El folio debe existir y pertenecer a una reserva activa o cerrada.',
      'Los pagos pueden ser parciales o completos.',
      'No permitir monto menor o igual a cero en pagos o cargos.',
      'Todo movimiento debe quedar auditado con usuario, fecha y concepto.',
      'No deben registrarse cargos o pagos sobre folios cerrados.'
    ],
    validations: [
      'amount > 0',
      'folio_id debe existir',
      'payment_method es obligatoria al registrar pago',
      'charge_type debe pertenecer al catalogo de cargos permitidos'
    ],
    expectedErrors: [
      errorSpec(409, 'El folio esta cerrado', 'Folio is closed'),
      errorSpec(422, 'Monto invalido', 'amount must be greater than zero'),
      errorSpec(422, 'Tipo de cargo invalido', 'charge_type is not allowed')
    ],
    permissions: ['payments.create', 'folios.view', 'folios.charge_post'],
    acceptanceChecks: [
      'Crear folio por reserva',
      'Registrar cargo',
      'Registrar pago parcial',
      'Actualizar saldo pendiente',
      'Bloquear movimientos sobre folio cerrado'
    ],
    testCases: [
      'POST /folios/:id/charges updates balance',
      'POST /payments partial payment updates balance',
      'POST /folios/:id/charges on closed folio returns 409'
    ]
  }),
  req('REQ-0006', 'functional', 'medium', 'El sistema debe generar reportes y dashboard de ocupacion, reservas activas, ingresos, salidas del dia y habitaciones disponibles.', 'Dashboard muestra metricas del dia y reportes exportables por periodo.', 6, {
    screenName: 'Dashboard',
    routePath: '/dashboard',
    endpointMethod: 'GET',
    endpointPath: '/dashboard/summary',
    requestFields: [fieldSpec('from', 'date', false), fieldSpec('to', 'date', false), fieldSpec('business_date', 'date', false)],
    responseFields: [
      fieldSpec('occupancy_rate', 'number', true),
      fieldSpec('active_reservations', 'number', true),
      fieldSpec('revenue', 'number', true),
      fieldSpec('pending_arrivals', 'number', true),
      fieldSpec('pending_departures', 'number', true),
      fieldSpec('available_rooms', 'number', true)
    ],
    businessRules: [
      'Ingresos deben considerar pagos registrados en el periodo.',
      'Ocupacion se calcula con habitaciones occupied sobre habitaciones activas.',
      'Las metricas de llegadas y salidas deben reflejar la fecha operativa seleccionada.'
    ],
    validations: ['from <= to si se envian fechas', 'business_date debe ser valida si se envia'],
    expectedErrors: [errorSpec(401, 'Usuario no autenticado', 'Unauthorized'), errorSpec(403, 'Rol sin permiso para consultar indicadores', 'Forbidden')],
    permissions: ['dashboard.view', 'reports.view'],
    acceptanceChecks: ['Dashboard carga metricas', 'Reporte filtra por periodo', 'Dashboard muestra pendientes operativos del dia'],
    testCases: [
      'GET /dashboard/summary returns expected counters',
      'GET /dashboard/summary with business_date returns arrivals and departures'
    ]
  }),
  req('REQ-0007', 'functional', 'high', 'El sistema debe soportar handoff de turno y cierre operativo con pendientes, pagos no conciliados, llegadas, salidas y auditoria nocturna trazable.', 'El cierre de turno identifica reservas con saldo, llegadas pendientes, salidas del dia y discrepancias de caja para el siguiente usuario.', 5, {
    screenName: 'Night Audit / Shift Handoff',
    routePath: '/night-audit',
    endpointMethod: 'GET',
    endpointPath: '/night-audit/summary',
    requestFields: [fieldSpec('business_date', 'date', true), fieldSpec('shift_code', 'string', false), fieldSpec('handoff_notes', 'string', false)],
    responseFields: [
      fieldSpec('pending_arrivals', 'number', true),
      fieldSpec('pending_departures', 'number', true),
      fieldSpec('unbalanced_folios', 'number', true),
      fieldSpec('late_checkouts', 'number', true),
      fieldSpec('unassigned_reservations', 'number', true)
    ],
    businessRules: [
      'El cierre debe mostrar discrepancias de caja y reservas con saldo.',
      'El handoff debe quedar visible para el siguiente turno.',
      'Night audit debe detectar habitaciones ocupadas sin folio abierto o con saldo inconsistente.',
      'Los pendientes operativos deben poder vincularse a reserva, folio o habitacion.'
    ],
    validations: ['business_date es obligatoria', 'shift_code debe existir si se captura handoff formal'],
    expectedErrors: [
      errorSpec(401, 'Usuario no autenticado', 'Unauthorized'),
      errorSpec(403, 'Rol sin permiso para ejecutar cierre o auditoria', 'Forbidden')
    ],
    permissions: ['reports.view', 'payments.create'],
    acceptanceChecks: [
      'Resumen de cierre disponible',
      'Pendientes visibles para el siguiente turno',
      'Night audit detecta folios y habitaciones inconsistentes'
    ],
    testCases: [
      'GET /night-audit/summary returns pending arrivals, departures and unbalanced folios',
      'GET /night-audit/summary includes late checkouts and unassigned reservations'
    ]
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
            { kind: 'note', fileName: 'entrevista-gerencia-pms.txt', mimeType: 'text/plain', notes: 'Transcripcion sintetica: dolor principal es duplicidad entre recepcion, caja y limpieza.' }
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
            { kind: 'note', fileName: 'observacion-checkin-am.md', mimeType: 'text/markdown', notes: 'Nota: validacion de llegadas, asignacion de habitaciones, tarifas y comunicacion con limpieza se hacen en herramientas separadas.' },
            { kind: 'file', fileName: 'captura-frontdesk-columnas.txt', mimeType: 'text/plain', notes: 'La vista operativa no muestra folio ni saldo consolidado; el recepcionista consulta otra libreta para cobros pendientes.' }
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
            { kind: 'note', fileName: 'focus-recepcion-turnos.txt', mimeType: 'text/plain', notes: 'Participantes reportan que los saldos y estados de habitacion se verifican manualmente.' },
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
          objective: 'Seguir una reserva realista desde llamada hasta confirmacion para detectar duplicidad, manejo de tarifa y validaciones faltantes.',
          realFlowSummary: 'La recepcionista consulta disponibilidad en Excel, define tarifa desde memoria, registra datos del huesped, asigna habitacion y anota saldo pendiente en otra hoja.',
          steps: [
            { order: 1, name: 'Cliente solicita habitacion', actorRole: 'Huesped', channel: 'Telefono', input: 'Fechas y numero de personas', action: 'Solicita disponibilidad', output: 'Datos preliminares', duration: '3 min', issue: 'Datos incompletos al primer contacto' },
            { order: 2, name: 'Recepcion consulta disponibilidad', actorStakeholderId: null, actorRole: 'Recepcionista', system: 'Excel', input: 'Fechas', action: 'Busca disponibilidad manualmente', output: 'Habitacion candidata', duration: '7 min', issue: 'Riesgo de solapamiento por hoja no actualizada' },
            { order: 3, name: 'Definicion de tarifa', actorRole: 'Recepcionista', system: 'Excel', input: 'Tipo de habitacion y fechas', action: 'Consulta tarifa en referencia manual', output: 'Monto por noche', duration: '4 min', issue: 'No existe catalogo unico de tarifas ni vigencias por canal' },
            { order: 4, name: 'Registro de reserva', actorRole: 'Recepcionista', system: 'Excel', input: 'Datos del huesped', action: 'Captura reserva y saldo', output: 'Reserva confirmada', duration: '8 min', issue: 'Duplicidad entre disponibilidad, saldo y datos del huesped' },
            { order: 5, name: 'Creacion de folio manual', actorRole: 'Recepcionista', system: 'Libretta/Caja', input: 'Reserva confirmada', action: 'Anota saldo pendiente y deposito', output: 'Control de cobro separado', duration: '3 min', issue: 'Folio no queda vinculado a la reserva en la misma herramienta' },
            { order: 6, name: 'Confirmacion al cliente', actorRole: 'Recepcionista', channel: 'Telefono', input: 'Reserva registrada', action: 'Comunica condiciones y pago pendiente', output: 'Cliente acepta', duration: '3 min' }
          ],
          problems: [
            { stepOrder: 2, description: 'La disponibilidad se valida manualmente en Excel, generando riesgo de sobreventa.', severity: 'high', impact: 'Reserva solapada o habitacion duplicada.' },
            { stepOrder: 3, description: 'La tarifa se consulta manualmente y puede variar entre turnos sin trazabilidad.', severity: 'high', impact: 'Cobros inconsistentes y conflictos con el huesped.' },
            { stepOrder: 5, description: 'El saldo pendiente queda separado de la reserva y puede omitirse en check-in.', severity: 'medium', impact: 'Errores de cobro y conciliacion.' }
          ],
          metrics: { totalTime: '28 min', targetTime: '8 min', deviation: '+250%', reworkCount: 3, manualStepCount: 6, informalApprovalCount: 1 }
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
        key: 'tracking-checkin-folio',
        stakeholderRoles: ['Recepcionista AM'],
        process: 'Operacion de front desk',
        subprocess: 'Check-in',
        metadata: {
          transactionId: 'CHK-DEMO-2026-014',
          transactionType: 'Check-in con deposito y folio abierto',
          startedAt: '2026-05-06T15:02:00Z',
          completedAt: '2026-05-06T15:18:00Z',
          finalStatus: 'checked_in_con_deposito',
          systemsInvolved: ['Recepcion', 'Caja', 'Bitacora manual'],
          objective: 'Seguir un check-in realista para verificar visibilidad de folio, saldo y estatus de habitacion.',
          realFlowSummary: 'La recepcion valida reserva, consulta saldo en un registro aparte, cobra deposito y marca ocupada la habitacion sin un folio visible en la pantalla principal.',
          steps: [
            { order: 1, name: 'Localizar reserva', actorRole: 'Recepcionista', system: 'Recepcion', input: 'Nombre o numero de reserva', action: 'Busca reserva del dia', output: 'Reserva localizada', duration: '2 min', issue: 'No siempre se usa el folio de reserva como llave principal' },
            { order: 2, name: 'Validar saldo y deposito', actorRole: 'Recepcionista', system: 'Caja', input: 'Reserva localizada', action: 'Consulta cobros pendientes', output: 'Saldo/deposito esperados', duration: '4 min', issue: 'El saldo no se visualiza en la misma vista del front desk' },
            { order: 3, name: 'Asignar llave y habitacion', actorRole: 'Recepcionista', system: 'Recepcion', input: 'Reserva y habitacion', action: 'Entrega acceso y marca ocupacion', output: 'Check-in completado', duration: '4 min', issue: 'El cambio de estatus no notifica automaticamente a limpieza' },
            { order: 4, name: 'Registrar deposito', actorRole: 'Recepcionista', system: 'Caja', input: 'Monto depositado', action: 'Anota pago parcial', output: 'Deposito registrado', duration: '3 min', issue: 'El pago queda sin folio unificado visible' }
          ],
          problems: [
            { stepOrder: 2, description: 'Front desk no muestra folio ni saldo pendiente en la misma tarjeta/lista.', severity: 'high', impact: 'Check-in lento y riesgo de cobrar mal.' },
            { stepOrder: 4, description: 'El deposito se registra sin visibilidad inmediata en la operacion principal.', severity: 'medium', impact: 'Doble captura o discrepancias de caja.' }
          ],
          metrics: { totalTime: '16 min', targetTime: '6 min', deviation: '+166%', reworkCount: 2, manualStepCount: 4, informalApprovalCount: 0 }
        },
        definition: {
          technique: 'Seguimiento Transaccional',
          techniqueCode: 'transaction_tracking',
          discoveryType: 'direct',
          title: 'Seguimiento transaccional de check-in CHK-DEMO-2026-014',
          occurredAt: '2026-05-06T15:02:00Z',
          notes: 'Seguimiento sintetico del front desk para confirmar necesidad de folio visible, saldo integrado y acciones rapidas reales.',
          evidences: [
            { kind: 'note', fileName: 'seguimiento-checkin-folio-demo.md', mimeType: 'text/markdown', notes: 'Recorrido del check-in con problemas de saldo, deposito y visibilidad de folio.' },
            { kind: 'file', fileName: 'metricas-checkin-folio.json', mimeType: 'application/json', notes: 'Tiempo total y comparativo contra tiempo objetivo.' }
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
      },
      {
        key: 'shadow-housekeeping',
        stakeholderRoles: ['Supervisora de Limpieza'],
        process: 'Control de habitaciones y limpieza',
        subprocess: 'Comunicacion de late checkouts',
        definition: {
          technique: 'Shadowing',
          techniqueCode: 'shadowing',
          discoveryType: 'direct',
          title: 'Shadowing de supervisora de limpieza en salidas y stay-overs',
          occurredAt: '2026-05-07T17:00:00Z',
          notes: 'Se siguio a la supervisora durante actualizacion de habitaciones, salidas tardias y coordinacion con recepcion.',
          evidences: [
            { kind: 'note', fileName: 'shadow-housekeeping-late-checkout.md', mimeType: 'text/markdown', notes: 'La supervisora recibe late checkouts por llamada o WhatsApp; no hay bandeja unica de habitaciones listas/no listas.' },
            { kind: 'file', fileName: 'tiempos-limpieza-demo.csv', mimeType: 'text/csv', notes: 'Tiempos estimados de liberacion, habitaciones sucias y estatus no sincronizados.' }
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
      ['tracking-reservation', 'need', 'Toda reserva confirmada debe incluir tarifa aplicada, monto por noche y folio visible para evitar cobros ambiguos.'],
      ['observation-frontdesk', 'need', 'Recepcion necesita registrar check-in y check-out en un flujo unico que actualice reserva, habitacion y comunicacion con limpieza.'],
      ['tracking-checkin-folio', 'need', 'Front desk debe mostrar reservation number, folio number, saldo pendiente y acciones rapidas en una sola vista operativa.'],
      ['survey-staff', 'need', 'El equipo de limpieza requiere actualizar estados de habitacion sin depender de llamadas o notas manuales de recepcion.'],
      ['focus-frontdesk', 'problem', 'Los pagos parciales, depositos y saldos pendientes se verifican al cierre de turno de forma manual, con riesgo de omisiones.'],
      ['document-analysis', 'need', 'Los checklists AM, PM y Night Audit evidencian necesidad de reportes operativos diarios y cierre de caja trazable.'],
      ['shadow-housekeeping', 'problem', 'Las salidas tardias y habitaciones listas no tienen una bandeja compartida en tiempo real entre recepcion y limpieza.']
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
      {
        requirementIndex: 0,
        title: 'US-RES - Gestionar ciclo de vida de reservacion',
        actor: 'Recepcionista',
        action: 'crear, editar, cancelar o dejar pending_assignment una reservacion con huesped, tarifa y disponibilidad validadas',
        benefit: 'evitar sobreventas, reservas incompletas y cambios operativos fuera de control',
        acceptanceCriteria:
          'Permite alta rapida de huesped; exige fechas y tarifa; calcula noches y total; permite pending_assignment sin room_id; recalcula al editar; libera inventario al cancelar; sugiere alternativas cuando no hay disponibilidad.'
      },
      {
        requirementIndex: 1,
        title: 'US-FD - Operar tablero de front desk',
        actor: 'Recepcionista',
        action: 'consultar una vista unificada con llegadas, estancias, salidas, folios y acciones rapidas',
        benefit: 'operar front desk sin cambiar entre multiples pantallas ni perder visibilidad de saldo y folio',
        acceptanceCriteria:
          'Cada fila muestra reservation_number, folio_number, huesped, habitacion, fechas, estado, saldo y tarifa; soporta filtros por llegadas, in-house, salidas y pendientes; expone acciones rapidas operativas.'
      },
      {
        requirementIndex: 2,
        title: 'US-CHK - Ejecutar check-in y check-out con control operativo',
        actor: 'Recepcionista',
        action: 'realizar entrada y salida de una estancia actualizando reserva, habitacion, folio y saldo',
        benefit: 'mantener ocupacion, cobro y estado de habitaciones sincronizados en tiempo real',
        acceptanceCriteria:
          'Check-in exige habitacion asignada y folio disponible; check-out valida saldo y aplica bloqueo u override; la habitacion pasa a occupied en entrada y a vacant_dirty o inspection_pending en salida.'
      },
      {
        requirementIndex: 3,
        title: 'US-ROM - Gestionar estados y asignacion de habitacion',
        actor: 'Supervisora de Limpieza',
        action: 'actualizar estados operativos y coordinar habitaciones asignables con recepcion',
        benefit: 'mantener la disponibilidad alineada con la condicion real del cuarto',
        acceptanceCriteria:
          'Soporta estados operativos completos; blocked y maintenance quedan fuera de asignacion; limpieza puede actualizar estatus; recepcion solo asigna habitaciones compatibles y disponibles.'
      },
      {
        requirementIndex: 4,
        title: 'US-FOL - Gestionar folios, cargos y pagos',
        actor: 'Recepcionista',
        action: 'abrir folios, registrar cargos y aplicar pagos parciales o totales',
        benefit: 'controlar saldo operativo de cada estancia con trazabilidad financiera',
        acceptanceCriteria:
          'La vista muestra folio y balance; permite cargos manuales y pagos con referencia; actualiza saldo inmediatamente; bloquea movimientos sobre folios cerrados.'
      },
      {
        requirementIndex: 5,
        title: 'US-DSH - Consultar dashboard y dataset demo operativo',
        actor: 'Gerente',
        action: 'consultar metricas del periodo y validar el sistema con datos demo realistas',
        benefit: 'tomar decisiones con datos accionables y probar el flujo completo con escenarios credibles',
        acceptanceCriteria:
          'El dashboard muestra ocupacion, reservas activas, ingresos, llegadas, salidas y habitaciones disponibles; el seed incluye huespedes, habitaciones, tarifas, folios, pagos y pendientes suficientes.'
      },
      {
        requirementIndex: 6,
        title: 'US-OPS - Ejecutar handoff y night audit',
        actor: 'Auditor Nocturno',
        action: 'consultar pendientes de turno, registrar handoff y ejecutar validacion de cierre del dia',
        benefit: 'entregar operacion trazable al siguiente turno y detectar inconsistencias antes del nuevo dia',
        acceptanceCriteria:
          'Muestra pendientes operativos; permite registrar handoff con incidencias; night audit detecta folios, habitaciones y reservaciones inconsistentes; publica un resumen usable por el siguiente turno.'
      }
    ];
    for (const useCase of useCases) {
      const result = await client.query(
        `INSERT INTO trace_use_cases (project_id, requirement_id, title, actor, action, benefit, acceptance_criteria)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          projectId,
          requirementIds[useCase.requirementIndex],
          useCase.title,
          useCase.actor,
          useCase.action,
          useCase.benefit,
          useCase.acceptanceCriteria
        ]
      );
      if (!implementationContracts[useCase.requirementIndex].useCaseId) {
        implementationContracts[useCase.requirementIndex].useCaseId = result.rows[0].id;
      }
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
