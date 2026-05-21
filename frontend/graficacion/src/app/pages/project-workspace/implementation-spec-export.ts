import type { Process } from '../../services/processes.service';
import type { Project } from '../../services/projects.service';
import type { Finding, Requirement, Session, Stakeholder } from '../../services/traceability.service';
import type {
  DataEntitySpec,
  DerivedDiagram,
  DerivedUseCase,
  ImplementationContract,
  ProjectArtifactFile,
  SavedDiagramEntry,
  TargetRoleSpec,
  TargetStack
} from './project-workspace.models';
import type { RequirementReadiness } from './requirement-readiness';
import { buildRequirementReadiness } from './requirement-readiness';

export type ImplementationSpecFile = {
  path: string;
  content: string;
};

export type ImplementationSpecExportInput = {
  project: Project | null;
  projectId: number | null;
  stakeholders: Stakeholder[];
  processes: Process[];
  sessions: Session[];
  findings: Finding[];
  requirements: Requirement[];
  useCases: DerivedUseCase[];
  diagrams: DerivedDiagram[];
  savedDiagrams: SavedDiagramEntry[];
  targetStack?: TargetStack;
  implementationContracts?: ImplementationContract[];
  dataEntities?: DataEntitySpec[];
  targetRoles?: TargetRoleSpec[];
  designInputs?: ProjectArtifactFile[];
  readiness?: RequirementReadiness;
  generatedAt?: string;
};

type InferredEntity = {
  name: string;
  tableName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number;
  attributes: string[];
  methods: string[];
  outgoingRelations: string[];
  incomingRelations: string[];
  source: string;
};

type ValidationIssue = {
  code: string;
  message: string;
};

const STOPWORDS = new Set([
  'para',
  'como',
  'quiero',
  'debe',
  'deben',
  'sistema',
  'usuario',
  'usuarios',
  'proceso',
  'procesos',
  'datos',
  'informacion',
  'registro',
  'gestionar',
  'gestion',
  'permite',
  'permitir',
  'realizar',
  'crear',
  'actualizar',
  'eliminar',
  'consultar',
  'validar',
  'generar',
  'requisito',
  'historia',
  'caso',
  'uso',
  'desde',
  'hasta',
  'cuando',
  'donde',
  'porque',
  'beneficio',
  'criterio',
  'aceptacion'
]);

const nowIso = (input: ImplementationSpecExportInput) => input.generatedAt ?? new Date().toISOString();

const readinessFor = (input: ImplementationSpecExportInput) =>
  input.readiness ??
  buildRequirementReadiness({
    project: input.project,
    stakeholders: input.stakeholders,
    processes: input.processes,
    sessions: input.sessions,
    findings: input.findings,
    requirements: input.requirements,
    useCases: input.useCases,
    specs: [],
    diagrams: input.diagrams,
    savedDiagrams: input.savedDiagrams
  });

const text = (value: string | null | undefined, fallback = 'No especificado') => {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const toPascal = (value: string) => {
  const cleaned = normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return cleaned || 'Entidad';
};

const toSnake = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '') || 'entidad';

const unique = <T>(items: T[]) => [...new Set(items)];

const bulletList = (items: string[], empty = '- Sin datos registrados') =>
  items.length ? items.map((item) => `- ${item}`).join('\n') : empty;

const markdownTable = (headers: string[], rows: string[][]) => {
  const safeRows = rows.length ? rows : [headers.map(() => '-')];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, '<br>')).join(' | ')} |`)
  ].join('\n');
};

const projectName = (input: ImplementationSpecExportInput) =>
  text(input.project?.name, `Proyecto ${input.projectId ?? 'Specora'}`);

const actorsFor = (input: ImplementationSpecExportInput) => {
  const stakeholderActors = input.stakeholders.map((stakeholder) =>
    `${stakeholder.name} (${stakeholder.role || stakeholder.type})`
  );
  const useCaseActors = input.useCases.map((useCase) => useCase.actor);
  return unique([...stakeholderActors, ...useCaseActors]).filter(Boolean);
};

const sessionLabel = (session: Session) =>
  `${session.title} (${session.technique_code || session.technique || session.discovery_type})`;

const sessionsForUseCase = (input: ImplementationSpecExportInput, useCase: DerivedUseCase) => {
  const findingSessionIds = new Set(useCase.sourceFindings.map((finding) => finding.session_id));
  return input.sessions.filter((session) => findingSessionIds.has(session.id));
};

const isTransactionSession = (session: Session) =>
  session.technique_code === 'transaction_tracking' ||
  /seguimiento|transaccional|transaction/i.test(`${session.technique} ${session.title}`);

const transactionStepsFor = (session: Session) => {
  const steps = session.metadata?.['steps'];
  return Array.isArray(steps)
    ? steps as Array<{
        order?: number;
        name?: string;
        actorStakeholderId?: number | null;
        actorRole?: string;
        system?: string;
        channel?: string;
        input?: string;
        action?: string;
        output?: string;
        duration?: string;
        waitTime?: string;
        issue?: string;
        evidenceRef?: string;
        notes?: string;
      }>
    : [];
};

const stakeholderName = (input: ImplementationSpecExportInput, id: number | null | undefined, fallback?: string) => {
  const stakeholder = id ? input.stakeholders.find((item) => item.id === id) : null;
  return stakeholder ? `${stakeholder.name} (${stakeholder.role})` : text(fallback, 'No especificado');
};

const requirementHasEvidence = (input: ImplementationSpecExportInput, requirement: Requirement) => {
  const traceItem = input.useCases.find((useCase) => useCase.requirement.id === requirement.id);
  return Boolean(traceItem?.sourceFindings.length || requirement.finding_count > 0 || requirement.finding_ids?.length);
};

const extractCandidateEntities = (input: ImplementationSpecExportInput) => {
  const sourceText = [
    input.project?.name,
    input.project?.objective,
    input.project?.description,
    ...input.processes.map((process) => `${process.name} ${process.description ?? ''}`),
    ...input.requirements.map((requirement) => `${requirement.description} ${requirement.acceptance_criteria}`),
    ...input.useCases.map((useCase) => `${useCase.title} ${useCase.actor} ${useCase.action} ${useCase.benefit}`),
    ...input.findings.map((finding) => finding.statement)
  ].join(' ');
  const tokens = normalize(sourceText)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/s$/g, ''))
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const counts = tokens.reduce<Record<string, number>>((acc, token) => {
    acc[token] = (acc[token] ?? 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([token]) => toPascal(token));
  return unique(['Usuario', ...input.stakeholders.map((stakeholder) => toPascal(stakeholder.role)), ...ranked]).slice(0, 12);
};

const inferEntities = (input: ImplementationSpecExportInput): InferredEntity[] => {
  const candidates = extractCandidateEntities(input);
  return candidates.map((name, index) => {
    const fromStakeholder = input.stakeholders.some((stakeholder) => toPascal(stakeholder.role) === name);
    const fromProcess = input.processes.some((process) => toPascal(process.name) === name);
    const confidence: InferredEntity['confidence'] = name === 'Usuario' || fromStakeholder ? 'HIGH' : fromProcess ? 'MEDIUM' : 'LOW';
    const confidenceScore = confidence === 'HIGH' ? 90 : confidence === 'MEDIUM' ? 70 : 45;
    const methods = unique(
      input.useCases
        .filter((useCase) => index === 0 || normalize(useCase.title + useCase.action).includes(normalize(name)))
        .map((useCase) => methodName(useCase.action || useCase.title))
    ).slice(0, 5);
    return {
      name,
      tableName: toSnake(name),
      confidence,
      confidenceScore,
      attributes: ['id: int', 'nombre: str', 'descripcion: str | None', 'estado: str', 'created_at: datetime'],
      methods: methods.length ? methods : [`crear_${toSnake(name)}`, `listar_${toSnake(name)}`, `actualizar_${toSnake(name)}`],
      outgoingRelations: name === 'Usuario' ? candidates.filter((candidate) => candidate !== name).map((candidate) => `gestiona ${candidate}`) : ['pertenece a Usuario'],
      incomingRelations: name === 'Usuario' ? ['referenciado por entidades operativas'] : ['creado o actualizado por Usuario'],
      source: confidence === 'LOW' ? 'Inferida desde requisitos, historias y hallazgos' : 'Derivada de actores/stakeholders/procesos'
    };
  });
};

const methodName = (value: string) => {
  const candidate = normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '')
    .split('_')
    .filter((part) => !STOPWORDS.has(part))
    .slice(0, 4)
    .join('_');
  return candidate || 'ejecutar_caso_de_uso';
};

const useCasesFor = (input: ImplementationSpecExportInput) =>
  input.useCases.length
    ? input.useCases
    : input.requirements.map((requirement) => ({
        id: `uc-derived-${requirement.id}`,
        persistedId: null,
        title: `Gestionar ${requirement.code}`,
        requirement,
        actor: 'usuario del sistema',
        action: requirement.description,
        benefit: 'cumplir el requisito documentado',
        acceptanceCriteria: requirement.acceptance_criteria,
        sourceFindings: [] as Finding[]
      }));

const contractFor = (input: ImplementationSpecExportInput, requirementId: number) =>
  input.implementationContracts?.find((contract) => contract.requirementId === requirementId) ?? null;

const targetStackFor = (input: ImplementationSpecExportInput): TargetStack => input.targetStack ?? {
  architectureType: 'SPA + API REST',
  backendFramework: 'FastAPI',
  backendLanguage: 'Python',
  backendOrm: 'SQLModel',
  backendDatabase: 'SQLite',
  backendMigrations: 'Alembic',
  backendAuth: 'JWT',
  backendTesting: 'pytest',
  frontendFramework: 'React + Vite',
  frontendLanguage: 'TypeScript',
  frontendUi: 'Bootstrap 5',
  frontendRouting: 'React Router',
  frontendDataFetching: 'TanStack Query + Axios',
  frontendState: 'Zustand',
  frontendTesting: 'Vitest / pruebas UI basicas',
  runMode: 'Local development',
  envVars: ['DATABASE_URL', 'JWT_SECRET_KEY', 'CORS_ORIGINS'],
  seedAdmin: 'admin@example.com / cambiar password',
  commands: ['backend: uvicorn app.main:app --reload', 'frontend: npm run dev', 'migraciones: alembic upgrade head']
};

const fieldRows = (fields: { name: string; type: string; required?: boolean; description?: string; example?: string }[]) =>
  fields.map((field) => [
    field.name,
    field.type,
    field.required ? 'Si' : 'No',
    field.description || '-',
    field.example || '-'
  ]);

const collectValidationIssues = (input: ImplementationSpecExportInput, entities = inferEntities(input)) => {
  const useCases = useCasesFor(input);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  if (!input.requirements.length) {
    errors.push({ code: 'NO_REQUIREMENTS', message: 'No hay requisitos registrados para construir specs implementables.' });
  }
  if (!useCases.length) {
    errors.push({ code: 'NO_USE_CASES', message: 'No hay casos de uso ni requisitos suficientes para derivarlos.' });
  }

  for (const requirement of input.requirements) {
    if (!requirementHasEvidence(input, requirement)) {
      warnings.push({
        code: 'REQUIREMENT_WITHOUT_EVIDENCE',
        message: `${requirement.code}: requisito sin evidencia o hallazgo vinculado.`
      });
    }
    if (!input.useCases.some((useCase) => useCase.requirement.id === requirement.id && useCase.persistedId)) {
      warnings.push({
        code: 'REQUIREMENT_WITHOUT_USE_CASE',
        message: `${requirement.code}: el caso de uso fue inferido o no esta persistido como historia/caso.`
      });
    }
  }

  for (const useCase of useCases) {
    if (!sessionsForUseCase(input, useCase).length) {
      warnings.push({
        code: 'USE_CASE_WITHOUT_PROCESS',
        message: `${useCase.title}: no tiene proceso o sesion trazable; se genera flujo basico inferido.`
      });
    }
  }

  if (!input.diagrams.length && !input.savedDiagrams.length) {
    warnings.push({ code: 'MISSING_DIAGRAMS', message: 'No hay diagramas guardados o derivados en el paquete.' });
  }

  const contracts = input.implementationContracts ?? [];
  for (const requirement of input.requirements) {
    const contract = contractFor(input, requirement.id);
    if (!contract) {
      warnings.push({ code: 'REQUIREMENT_WITHOUT_CONTRACT', message: `${requirement.code}: falta contrato tecnico implementable.` });
      continue;
    }
    if (!contract.endpointPath) {
      warnings.push({ code: 'CONTRACT_WITHOUT_ENDPOINT', message: `${requirement.code}: contrato sin endpoint.` });
    }
    if (!contract.validations.length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_VALIDATIONS', message: `${requirement.code}: contrato sin validaciones.` });
    }
    if (!contract.expectedErrors.length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_EXPECTED_ERRORS', message: `${requirement.code}: contrato sin errores esperados.` });
    }
  }
  if (!(input.dataEntities ?? []).length) {
    warnings.push({ code: 'NO_MANUAL_DATA_MODEL', message: 'No hay entidades manuales del modelo de datos; se usaran inferencias.' });
  }
  for (const entity of input.dataEntities ?? []) {
    if (!entity.fields.length) {
      warnings.push({ code: 'ENTITY_WITHOUT_FIELDS', message: `${entity.name}: entidad sin campos definidos.` });
    }
    if (entity.relationships.some((relationship) => !relationship.foreignKey && relationship.type !== 'many-to-many')) {
      warnings.push({ code: 'RELATION_WITHOUT_FK', message: `${entity.name}: relacion sin FK sugerida.` });
    }
  }
  if (!(input.targetRoles ?? []).length) {
    warnings.push({ code: 'NO_TARGET_ROLES', message: 'No hay roles/permisos definidos para el sistema objetivo.' });
  }
  for (const role of input.targetRoles ?? []) {
    if (!role.permissions.length) {
      warnings.push({ code: 'ROLE_WITHOUT_PERMISSIONS', message: `${role.name}: rol sin permisos.` });
    }
  }
  const stack = targetStackFor(input);
  if (!stack.backendFramework || !stack.frontendFramework || !stack.backendDatabase || !stack.backendAuth) {
    warnings.push({ code: 'TARGET_STACK_INCOMPLETE', message: 'Stack objetivo incompleto: backend/frontend/base de datos/auth deben estar definidos.' });
  }

  for (const entity of entities.filter((entity) => entity.confidence === 'LOW')) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      message: `${entity.name}: entidad inferida con baja confianza; validar nombre, atributos y relaciones.`
    });
  }

  for (const entity of entities) {
    suggestions.push({
      code: 'CRUD_SUGGESTION',
      message: `Crear CRUD base para ${entity.name}: listar, crear, editar, eliminar logico y detalle.`
    });
  }

  return { errors, warnings, suggestions };
};

export const buildAgentInstructionsMarkdown = (input: ImplementationSpecExportInput) => [
  '# Instrucciones para equipo implementador',
  '',
  `Sistema objetivo: **${projectName(input)}**`,
  `Generado desde Specora: ${nowIso(input)}`,
  '',
  '## Orden obligatorio de lectura',
  '',
  'Lee y usa los archivos en este orden:',
  '',
  '1. `01_AGENT_INSTRUCTIONS.md`',
  '2. `02_REQUIREMENTS.md`',
  '3. `03_CLASS_MODEL.md`',
  '4. `04_ARCHITECTURE.md`',
  '5. `05_PROCESS.md`',
  '6. `06_EXECUTION.md`',
  '7. `07_DESIGN.md`',
  '8. `08_VALIDATION_REPORT.md`',
  '',
  '## Stack objetivo',
  '',
  '- Backend: FastAPI + SQLModel + Alembic + SQLite.',
  '- Frontend: Vite + React + TypeScript + Bootstrap 5.',
  '- Auth: JWT con login, proteccion de rutas y seed de usuario administrador.',
  '- API: routers por modulo, schemas separados, services con reglas de negocio y tests basicos.',
  '- Persistencia: modelos SQLModel, migraciones Alembic y datos seed reproducibles.',
  '',
  '## Estrategia de implementacion',
  '',
  '- Implementa desde dominio hacia interfaz: entidades, modelos, migraciones, servicios, endpoints, UI.',
  '- No inventes reglas como definitivas cuando el reporte de validacion marque inferencias o baja confianza.',
  '- Todo output inferido debe quedar facil de ajustar en codigo: nombres claros, servicios pequenos y componentes reutilizables.',
  '- Mantener CRUD completo para entidades centrales y flujos guiados para casos de uso principales.',
  '- Cada endpoint debe validar permisos, payload y estados de negocio antes de persistir.',
  '',
  '## Checklist final',
  '',
  '- Backend levanta con `uvicorn app.main:app --reload`.',
  '- Migraciones corren con Alembic sobre SQLite.',
  '- Existe seed admin documentado.',
  '- Frontend levanta con `npm run dev`.',
  '- Login JWT funciona.',
  '- CRUD y casos de uso principales funcionan de punta a punta.',
  '- UI cumple `07_DESIGN.md` y evita pantallas CRUD pobres.',
  '- Warnings de `08_VALIDATION_REPORT.md` fueron revisados o documentados.'
].join('\n');

export const buildRequirementsMarkdown = (input: ImplementationSpecExportInput) => {
  const useCases = useCasesFor(input);
  const entities = inferEntities(input);
  const roles = input.targetRoles ?? [];
  return [
    '# Requisitos del sistema',
    '',
    `## Nombre del sistema`,
    '',
    projectName(input),
    '',
    '## Descripcion general',
    '',
    text(input.project?.description ?? input.project?.objective, 'Descripcion inferida desde el proyecto en Specora.'),
    '',
    '## Problema que resuelve',
    '',
    text(input.project?.objective, 'Pendiente de documentar con claridad en el contexto del proyecto.'),
    '',
    '## Alcance incluido',
    '',
    text(input.project?.scope, 'Pendiente de separar funcionalidades obligatorias y opcionales.'),
    '',
    '## Fuera de alcance',
    '',
    'No especificado. El equipo debe confirmar que funcionalidades quedan fuera antes de implementar.',
    '',
    '## Actores',
    '',
    bulletList(actorsFor(input)),
    '',
    '## Roles y permisos objetivo',
    '',
    roles.length
      ? markdownTable(
          ['Rol', 'Tipo', 'Permisos', 'Pantallas', 'Endpoints'],
          roles.map((role) => [
            role.name,
            role.userType || '-',
            role.permissions.join('<br>') || '-',
            role.screens.join('<br>') || '-',
            role.endpoints.join('<br>') || '-'
          ])
        )
      : '- No hay roles objetivo capturados. Definir Admin/Usuario/etc. antes de cerrar implementacion.',
    '',
    '## Casos de uso detallados',
    '',
    ...useCases.map((useCase, index) =>
      [
        `### CU-${index + 1}: ${useCase.title}`,
        '',
        `- Requisito origen: ${useCase.requirement.code}`,
        `- Actor principal: ${useCase.actor}`,
        `- Objetivo: ${useCase.action}`,
        `- Beneficio esperado: ${useCase.benefit}`,
        `- Prioridad: ${useCase.requirement.priority}`,
        `- Tipo: ${useCase.requirement.type}`,
        '',
        '#### Criterios de aceptacion',
        '',
        text(useCase.acceptanceCriteria || useCase.requirement.acceptance_criteria, 'Pendiente de detallar.'),
        '',
        '#### Flujos asociados',
        '',
        bulletList(sessionsForUseCase(input, useCase).map(sessionLabel), '- Flujo basico inferido; falta proceso/sesion trazable.'),
        '',
        '#### Trazabilidad de evidencia',
        '',
        bulletList(
          useCase.sourceFindings.map((finding) => {
            const session = input.sessions.find((item) => item.id === finding.session_id);
            const process = session?.process_id ? input.processes.find((item) => item.id === session.process_id) : null;
            const transaction = session && isTransactionSession(session) ? `; seguimiento transaccional ${session.metadata?.['transactionId'] ?? session.title}` : '';
            return `${finding.statement} -> ${useCase.requirement.code}${process ? ` -> proceso ${process.name}` : ''}${transaction}`;
          }),
          '- Sin hallazgos/evidencias vinculadas.'
        ),
        '',
        '#### Contrato tecnico',
        '',
        (() => {
          const contract = contractFor(input, useCase.requirement.id);
          return contract
            ? [
                `- Pantalla: ${text(contract.screenName, 'No especificada')}`,
                `- Ruta UI: ${text(contract.routePath, 'No especificada')}`,
                `- Endpoint: ${text(`${contract.endpointMethod ?? ''} ${contract.endpointPath ?? ''}`.trim(), 'No especificado')}`,
                '',
                '##### Request fields',
                markdownTable(['Campo', 'Tipo', 'Requerido', 'Descripcion', 'Ejemplo'], fieldRows(contract.requestFields)),
                '',
                '##### Response fields',
                markdownTable(['Campo', 'Tipo', 'Requerido', 'Descripcion', 'Ejemplo'], fieldRows(contract.responseFields)),
                '',
                '##### Reglas de negocio',
                bulletList(contract.businessRules, '- Pendiente'),
                '',
                '##### Validaciones',
                bulletList(contract.validations, '- Pendiente'),
                '',
                '##### Errores esperados',
                markdownTable(
                  ['HTTP', 'Condicion', 'Mensaje'],
                  contract.expectedErrors.map((error) => [String(error.statusCode), error.condition, error.message])
                ),
                '',
                '##### Permisos',
                bulletList(contract.permissions, '- Pendiente'),
                '',
                '##### Pruebas',
                bulletList(contract.testCases, '- Pendiente')
              ].join('\n')
            : '_Warning: falta contrato tecnico manual para este requisito._';
        })()
      ].join('\n')
    ),
    '',
    '## Matriz de relaciones entre casos de uso',
    '',
    markdownTable(
      ['Caso de uso', 'Requisito', 'Evidencia', 'Contrato tecnico'],
      useCases.map((useCase, index) => [
        `CU-${index + 1}`,
        useCase.requirement.code,
        useCase.sourceFindings.length ? `${useCase.sourceFindings.length} hallazgo(s)` : 'Sin evidencia',
        contractFor(input, useCase.requirement.id)?.endpointPath ?? 'Sin contrato'
      ])
    ),
    '',
    '## Entidades de negocio involucradas',
    '',
    markdownTable(
      ['Entidad', 'Tabla sugerida', 'Confianza', 'Origen'],
      entities.map((entity) => [entity.name, entity.tableName, entity.confidence, entity.source])
    )
  ].join('\n');
};

export const buildClassModelMarkdown = (input: ImplementationSpecExportInput) => {
  const entities = inferEntities(input);
  const manualEntities = input.dataEntities ?? [];
  if (manualEntities.length > 0) {
    return [
      '# Modelo de clases y datos',
      '',
      'Este modelo prioriza entidades capturadas manualmente en Specora. Las relaciones y reglas aqui descritas deben implementarse en modelos, migraciones y servicios.',
      '',
      '## Resumen de entidades manuales',
      '',
      markdownTable(
        ['Entidad', 'Tabla', 'Origen', 'Confianza', 'Campos', 'Relaciones'],
        manualEntities.map((entity) => [
          entity.name,
          entity.tableName,
          entity.source,
          entity.confidence,
          String(entity.fields.length),
          String(entity.relationships.length)
        ])
      ),
      '',
      ...manualEntities.map((entity) =>
        [
          `## ${entity.name}`,
          '',
          `- Tabla: \`${entity.tableName}\``,
          `- Origen: ${entity.source}`,
          `- Confianza: ${entity.confidence}`,
          `- Descripcion: ${text(entity.description, 'No especificada')}`,
          '',
          '### Campos',
          '',
          markdownTable(
            ['Campo', 'Tipo', 'Requerido', 'Unico', 'Nullable', 'Default', 'Ejemplo', 'Descripcion'],
            entity.fields.map((field) => [
              field.name,
              field.type,
              field.required ? 'Si' : 'No',
              field.unique ? 'Si' : 'No',
              field.nullable ? 'Si' : 'No',
              field.defaultValue || '-',
              field.example || '-',
              field.description || '-'
            ])
          ),
          '',
          '### Relaciones',
          '',
          markdownTable(
            ['Origen', 'Tipo', 'Destino', 'FK sugerida', 'On delete', 'Descripcion'],
            entity.relationships.map((relationship) => [
              relationship.fromEntity,
              relationship.type,
              relationship.toEntity,
              relationship.foreignKey || '-',
              relationship.onDelete || '-',
              relationship.description || '-'
            ])
          ),
          '',
          '### Integridad',
          '',
          bulletList(entity.integrityRules, '- Sin reglas de integridad capturadas.')
        ].join('\n')
      ),
      '',
      '## Entidades inferidas adicionales',
      '',
      markdownTable(
        ['Entidad', 'Tabla', 'Confianza', 'Origen'],
        entities
          .filter((entity) => !manualEntities.some((manual) => normalize(manual.name) === normalize(entity.name)))
          .map((entity) => [entity.name, entity.tableName, entity.confidence, entity.source])
      )
    ].join('\n');
  }
  return [
    '# Modelo de clases',
    '',
    'Este modelo combina datos capturados y heuristicas. Las entidades marcadas como `LOW` deben validarse antes de implementar migraciones finales.',
    '',
    '## Resumen de entidades',
    '',
    markdownTable(
      ['Entidad', 'Tabla', 'Confianza', 'Atributos principales'],
      entities.map((entity) => [entity.name, entity.tableName, `${entity.confidence} (${entity.confidenceScore}%)`, entity.attributes.join(', ')])
    ),
    '',
    ...entities.map((entity) =>
      [
        `## ${entity.name}`,
        '',
        `- Tabla: \`${entity.tableName}\``,
        `- Confianza: ${entity.confidence} (${entity.confidenceScore}%)`,
        `- Origen: ${entity.source}`,
        '',
        '### Atributos',
        '',
        bulletList(entity.attributes.map((attribute) => `\`${attribute}\``)),
        '',
        '### Metodos sugeridos',
        '',
        bulletList(entity.methods.map((method) => `\`${method}()\``)),
        '',
        '### Relaciones salientes',
        '',
        bulletList(entity.outgoingRelations),
        '',
        '### Relaciones entrantes',
        '',
        bulletList(entity.incomingRelations)
      ].join('\n')
    ),
    '',
    '## Matriz de relaciones',
    '',
    markdownTable(
      ['Origen', 'Relacion', 'Destino', 'Tipo'],
      entities.flatMap((entity) =>
        entity.outgoingRelations.map((relation) => [
          entity.name,
          relation,
          entity.name === 'Usuario' ? relation.replace('gestiona ', '') : 'Usuario',
          entity.confidence === 'LOW' ? 'Inferida' : 'Recomendada'
        ])
      )
    )
  ].join('\n');
};

export const buildArchitectureMarkdown = (input: ImplementationSpecExportInput) => {
  const stack = targetStackFor(input);
  return [
    '# Arquitectura objetivo',
    '',
    `Sistema: ${projectName(input)}`,
    `Tipo de arquitectura: ${stack.architectureType}`,
    '',
    '## Backend target',
    '',
    `- Framework: ${stack.backendFramework}.`,
    `- Lenguaje: ${stack.backendLanguage}.`,
    `- ORM: ${stack.backendOrm || 'No especificado'}.`,
    `- Migraciones: ${stack.backendMigrations || 'No especificadas'}.`,
    `- Base de datos: ${stack.backendDatabase}.`,
    `- Auth: ${stack.backendAuth || 'No especificado'}.`,
    `- Testing: ${stack.backendTesting || 'No especificado'}.`,
    '- Capas: routers, schemas, services, repositories simples cuando agreguen claridad, models y core.',
  '',
  '### Estructura sugerida',
  '',
  '```txt',
  'backend/',
  '  app/',
  '    main.py',
  '    core/config.py',
  '    core/security.py',
  '    db/session.py',
  '    models/',
  '    schemas/',
  '    services/',
  '    routers/',
  '    seed.py',
  '  alembic/',
  '  tests/',
  '```',
  '',
  '## Frontend target',
  '',
  `- Framework/build: ${stack.frontendFramework}.`,
  `- Lenguaje: ${stack.frontendLanguage}.`,
  `- UI library: ${stack.frontendUi || 'No especificada'}.`,
  `- Routing: ${stack.frontendRouting || 'No especificado'}.`,
  `- Data fetching: ${stack.frontendDataFetching || 'No especificado'}.`,
  `- Estado: ${stack.frontendState || 'No especificado'}.`,
  `- Testing: ${stack.frontendTesting || 'No especificado'}.`,
  '',
  '### Estructura sugerida',
  '',
  '```txt',
  'frontend/',
  '  src/',
  '    app/router.tsx',
  '    api/client.ts',
  '    auth/',
  '    components/ui/',
  '    features/',
  '    layouts/',
  '    stores/',
  '```',
  '',
  '## Reglas de implementacion',
  '',
  '- Cada entidad debe tener schema de entrada, schema de salida y servicio.',
  '- Los endpoints deben usar nombres REST claros: `GET /api/<recurso>`, `POST`, `PATCH`, `DELETE` logico cuando aplique.',
  '- Los errores de validacion deben responder con HTTP 400/422 y mensajes accionables.',
  '- Las pantallas no deben exponer tablas CRUD crudas como experiencia principal; usar workflows, filtros, estados vacios y paneles de detalle.',
  '- El frontend debe centralizar loading, error y empty state.',
  '- Cada caso de uso importante debe tener ruta o accion visible.',
  '',
  '## Ejecucion local e infraestructura',
  '',
  `- Modo: ${stack.runMode || 'No especificado'}`,
  `- Seed admin: ${stack.seedAdmin || 'No especificado'}`,
  '',
  '### Variables de entorno',
  '',
  bulletList(stack.envVars.map((item) => `\`${item}\``), '- Pendiente'),
  '',
  '### Comandos esperados',
  '',
  bulletList(stack.commands.map((item) => `\`${item}\``), '- Pendiente')
].join('\n');
};

export const buildProcessMarkdown = (input: ImplementationSpecExportInput) => {
  const useCases = useCasesFor(input);
  const transactionSessions = input.sessions.filter(isTransactionSession);
  return [
    '# Procesos y flujos',
    '',
    'Cada flujo incluye origen, destino, accion, capa e hint de implementacion para guiar al equipo constructor.',
    '',
    '## Procesos registrados',
    '',
    markdownTable(
      ['Proceso', 'Descripcion', 'Seguimientos reales'],
      input.processes.map((process) => [
        process.name,
        process.description ?? 'Sin descripcion',
        String(transactionSessions.filter((session) => session.process_id === process.id).length)
      ])
    ),
    '',
    '## Seguimientos transaccionales',
    '',
    transactionSessions.length
      ? transactionSessions.map((session) => {
          const steps = transactionStepsFor(session);
          const process = input.processes.find((item) => item.id === session.process_id);
          const metrics = session.metadata?.['metrics'] as Record<string, unknown> | undefined;
          return [
            `### ${session.title}`,
            '',
            `- Proceso: ${process?.name ?? 'No vinculado'}`,
            `- Transaccion: ${text(String(session.metadata?.['transactionId'] ?? ''), 'No especificada')}`,
            `- Tipo: ${text(String(session.metadata?.['transactionType'] ?? ''), 'No especificado')}`,
            `- Estado final: ${text(String(session.metadata?.['finalStatus'] ?? ''), 'No especificado')}`,
            `- Sistemas/canales: ${Array.isArray(session.metadata?.['systemsInvolved']) ? (session.metadata['systemsInvolved'] as string[]).join(', ') : 'No especificados'}`,
            metrics ? `- Tiempo total: ${text(String(metrics['totalTime'] ?? ''), 'No especificado')}` : '',
            metrics ? `- Desviacion: ${text(String(metrics['deviation'] ?? ''), 'No especificada')}` : '',
            '',
            steps.length
              ? markdownTable(
                  ['Paso', 'Actor', 'Sistema/canal', 'Entrada', 'Accion', 'Salida', 'Tiempo', 'Problema'],
                  steps.map((step, index) => [
                    `${step.order ?? index + 1}. ${text(step.name, 'Paso sin nombre')}`,
                    stakeholderName(input, step.actorStakeholderId, step.actorRole),
                    [step.system, step.channel].filter(Boolean).join(' / ') || 'No especificado',
                    step.input ?? '-',
                    step.action ?? '-',
                    step.output ?? '-',
                    [step.duration, step.waitTime ? `espera ${step.waitTime}` : ''].filter(Boolean).join(', ') || '-',
                    step.issue ?? '-'
                  ])
                )
              : '_Warning: seguimiento sin pasos observados._'
          ].filter(Boolean).join('\n');
        }).join('\n\n')
      : '_No hay seguimientos transaccionales registrados. Los flujos por caso de uso se muestran como inferencias basicas._',
    '',
    ...useCases.map((useCase, index) => {
      const linkedSessions = sessionsForUseCase(input, useCase);
      const processRows = linkedSessions.length
        ? linkedSessions.map((session, stepIndex) => [
            String(stepIndex + 1),
            useCase.actor,
            'Sistema',
            sessionLabel(session),
            'Aplicacion',
            `Usar datos de trace_session ${session.id}; validar relaciones y evidencia.`
          ])
        : [
            ['1', useCase.actor, 'Frontend', `Iniciar ${useCase.title}`, 'UI', 'Crear formulario guiado y validar campos requeridos.'],
            ['2', 'Frontend', 'Backend API', 'Enviar payload validado', 'API', 'Usar axios + TanStack Query mutation.'],
            ['3', 'Backend API', 'Servicio de dominio', 'Validar reglas del requisito', 'Service', `Aplicar criterios de ${useCase.requirement.code}.`],
            ['4', 'Servicio de dominio', 'SQLite', 'Persistir cambios', 'DB', 'Usar SQLModel y transaccion corta.'],
            ['5', 'Backend API', useCase.actor, 'Confirmar resultado', 'UI', 'Mostrar estado, detalle y siguiente accion.']
          ];
      return [
        `## Proceso ${index + 1}: ${useCase.title}`,
        '',
        `- Caso de uso: CU-${index + 1}`,
        `- Requisito: ${useCase.requirement.code}`,
        `- Origen: ${linkedSessions.length ? 'Sesiones/hallazgos trazables' : 'Inferencia por falta de proceso paso a paso'}`,
        '',
        markdownTable(['Paso', 'Origen', 'Destino', 'Accion', 'Capa', 'Hint de implementacion'], processRows),
        '',
        '### Validaciones requeridas',
        '',
        bulletList([
          'Usuario autenticado con JWT cuando la ruta no sea publica.',
          `Payload cumple criterios de aceptacion de ${useCase.requirement.code}.`,
          'Relaciones referenciadas existen antes de persistir.',
          'Errores se muestran en UI con mensaje claro.'
        ]),
        '',
        '### Entidades afectadas',
        '',
        bulletList(inferEntities(input).slice(0, 5).map((entity) => entity.name))
      ].join('\n');
    })
  ].join('\n');
};

export const buildExecutionMarkdown = () => [
  '# Plan de ejecucion',
  '',
  '## Fase 1: Lectura y plan',
  '',
  '- Leer archivos 01 a 08 en orden.',
  '- Identificar errores bloqueantes del reporte de validacion.',
  '- Confirmar entidades finales antes de migraciones si hay LOW_CONFIDENCE.',
  '',
  '## Fase 2: Backend setup',
  '',
  '- Crear proyecto FastAPI.',
  '- Configurar SQLModel, SQLite, Alembic, settings y CORS.',
  '- Implementar seguridad JWT y seed admin.',
  '',
  '## Fase 3: Backend API',
  '',
  '- Modelos y migraciones.',
  '- Schemas de request/response.',
  '- Routers y services por entidad/caso de uso.',
  '- Tests minimos de auth y CRUD central.',
  '',
  '## Fase 4: Frontend setup',
  '',
  '- Crear Vite React TypeScript.',
  '- Instalar Bootstrap, React Router, TanStack Query, Zustand y Axios.',
  '- Configurar layout protegido, login y cliente API.',
  '',
  '## Fase 5: Features y rutas',
  '',
  '- Implementar dashboard operativo.',
  '- Implementar CRUD de entidades.',
  '- Implementar flujos principales descritos en 05_PROCESS.md.',
  '',
  '## Fase 6: UX/UI',
  '',
  '- Aplicar sistema visual de 07_DESIGN.md.',
  '- Agregar empty states, badges, feedback de guardado, loading y errores.',
  '- Evitar pantallas con tabla cruda como unica experiencia.',
  '',
  '## Fase 7: Verificacion final',
  '',
  '- Ejecutar backend tests.',
  '- Ejecutar build frontend.',
  '- Probar login, navegacion y CRUD.',
  '- Revisar warnings pendientes.',
  '',
  '## Fase 8: Integracion CRUD',
  '',
  '- Validar crear, listar, editar y eliminar/logical delete por entidad.',
  '- Validar que cada caso de uso tenga accion visible y persistencia real.'
].join('\n');

const designInputContent = (input: ImplementationSpecExportInput) =>
  (input.designInputs ?? [])
    .filter((file) => file.encoding === 'text' && /\.(md|markdown|txt)$/i.test(file.name))
    .map((file) => ({
      path: `${file.folder ? `${file.folder}/` : ''}${file.name}`,
      content: file.content.trim()
    }))
    .filter((file) => file.content.length > 0);

export const buildDesignMarkdown = (input: ImplementationSpecExportInput) => {
  const inputs = designInputContent(input);
  return [
    '# Design system y experiencia',
    '',
    'La interfaz debe sentirse cercana a Vercel, Figma, Linear, Raycast y Stripe: sobria, rapida, precisa y profesional.',
    '',
    '## Instrucciones de diseno importadas',
    '',
    inputs.length > 0
      ? 'Esta seccion incluye lineamientos manuales importados a Specora, por ejemplo archivos `.md` generados por Stitch. El equipo implementador debe tratarlos como referencia prioritaria, validando que no contradigan requisitos funcionales, accesibilidad ni alcance.'
      : 'No se importaron archivos de diseno. Usa las reglas base de este documento y valida visualmente las pantallas principales.',
    '',
    ...inputs.flatMap((file, index) => [
      `### Fuente ${index + 1}: ${file.path}`,
      '',
      '```md',
      file.content.slice(0, 12000),
      file.content.length > 12000 ? '\n<!-- Contenido recortado por longitud. Revisar archivo fuente completo en el paquete del proyecto. -->' : '',
      '```',
      ''
    ]),
    '## Paleta base',
    '',
    '- Base: zinc/neutra (`#09090b`, `#18181b`, `#27272a`, `#71717a`, `#e4e4e7`, `#fafafa`).',
    '- Acento principal: azul o indigo sobrio para acciones primarias.',
    '- Estados: verde para exito, amber para advertencia, rojo para error.',
    '- Si el archivo importado define tokens visuales distintos, usarlos solo cuando mantengan contraste y consistencia.',
    '',
    '## Componentes',
    '',
    '- `PageHeader`: titulo, descripcion corta y acciones principales.',
    '- `Card`: radio maximo 8px, borde sutil, padding consistente.',
    '- `Button`: variantes primary, secondary, ghost y danger; con icono cuando aplique.',
    '- `Input`: label visible, ayuda corta, error inline.',
    '- `Badge`: estado compacto con contraste suficiente.',
    '- `EmptyState`: mensaje breve, accion siguiente y sin ilustraciones decorativas pesadas.',
    '- `DataToolbar`: busqueda, filtros y ordenamiento.',
    '',
    '## Layout',
    '',
    '- Sidebar estable para modulos principales.',
    '- Contenido max-width controlado, pero tablas y workbenches pueden usar ancho completo.',
    '- Responsive desde mobile: formularios en una columna, acciones agrupadas.',
    '- Densidad empresarial: menos hero, mas informacion escaneable.',
    '',
    '## Reglas de calidad visual',
    '',
    '- No crear CRUD feo: cada lista debe tener busqueda, filtros, estado, accion principal y detalle.',
    '- No meter cards dentro de cards.',
    '- Los textos no deben desbordar botones, badges ni tablas.',
    '- Cada pantalla debe mostrar claramente que se puede hacer despues.',
    '- Las referencias importadas desde Stitch son guia visual; la implementacion final debe seguir criterios de accesibilidad, responsive y validacion manual.'
  ].join('\n');
};

export const buildValidationReportMarkdown = (input: ImplementationSpecExportInput) => {
  const entities = inferEntities(input);
  const issues = collectValidationIssues(input, entities);
  const readiness = readinessFor(input);
  return [
    '# Validation report',
    '',
    `Sistema: ${projectName(input)}`,
    `Generado: ${nowIso(input)}`,
    `Score de preparacion: ${readiness.score}/100`,
    `Estado: ${readiness.status}`,
    '',
    '## Errors',
    '',
    bulletList(
      [
        ...readiness.errors.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.errors.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- Sin errores bloqueantes detectados.'
    ),
    '',
    '## Warnings',
    '',
    bulletList(
      [
        ...readiness.warnings.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.warnings.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- Sin warnings detectados.'
    ),
    '',
    '## Suggestions',
    '',
    bulletList(
      [
        ...readiness.suggestions.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.suggestions.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- Sin sugerencias adicionales.'
    ),
    '',
    '## Matriz de faltantes',
    '',
    markdownTable(
      ['Severidad', 'Codigo', 'Modulo', 'Accion'],
      [...readiness.errors, ...readiness.warnings, ...readiness.suggestions].map((issue) => [
        issue.severity,
        issue.code,
        issue.module,
        issue.actionLabel
      ])
    ),
    '',
    '## Cobertura de trazabilidad',
    '',
    markdownTable(
      ['Elemento', 'Total'],
      [
        ['Stakeholders', String(input.stakeholders.length)],
        ['Sesiones', String(input.sessions.length)],
        ['Hallazgos', String(input.findings.length)],
        ['Requisitos', String(input.requirements.length)],
        ['Casos de uso', String(useCasesFor(input).length)],
        ['Contratos tecnicos', String(input.implementationContracts?.length ?? 0)],
        ['Entidades manuales', String(input.dataEntities?.length ?? 0)],
        ['Roles objetivo', String(input.targetRoles?.length ?? 0)],
        ['Insumos de diseno importados', String(input.designInputs?.length ?? 0)],
        ['Diagramas derivados', String(input.diagrams.length)],
        ['Diagramas guardados', String(input.savedDiagrams.length)]
      ]
    ),
    '',
    '## Checklist evaluable',
    '',
    bulletList([
      'Backend corre localmente con comandos documentados.',
      'Frontend corre localmente con comandos documentados.',
      'Login/autenticacion funciona si el sistema requiere roles.',
      'CRUD principal completo para entidades centrales.',
      'Validaciones de negocio implementadas en backend.',
      'Errores 400/401/403/404/409/422 documentados donde aplique.',
      'README con pasos de instalacion, seed y ejemplos de uso.',
      'Pruebas basicas de API y flujo principal.'
    ])
  ].join('\n');
};

export const buildImplementationSpecFiles = (input: ImplementationSpecExportInput): ImplementationSpecFile[] => [
  { path: '01_AGENT_INSTRUCTIONS.md', content: buildAgentInstructionsMarkdown(input) },
  { path: '02_REQUIREMENTS.md', content: buildRequirementsMarkdown(input) },
  { path: '03_CLASS_MODEL.md', content: buildClassModelMarkdown(input) },
  { path: '04_ARCHITECTURE.md', content: buildArchitectureMarkdown(input) },
  { path: '05_PROCESS.md', content: buildProcessMarkdown(input) },
  { path: '06_EXECUTION.md', content: buildExecutionMarkdown() },
  { path: '07_DESIGN.md', content: buildDesignMarkdown(input) },
  { path: '08_VALIDATION_REPORT.md', content: buildValidationReportMarkdown(input) }
];
