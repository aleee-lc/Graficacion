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

type DomainExecutionPolicy = {
  domainType: string;
  requiresDomainReasoning: boolean;
  requiresExternalResearch: boolean;
  researchTriggers: string[];
  operationalFocusAreas: string[];
  forbiddenSimplifications: string[];
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

const text = (value: string | null | undefined, fallback = 'Not specified') => {
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

const bulletList = (items: string[], empty = '- No data recorded') =>
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

const sourceCorpus = (input: ImplementationSpecExportInput) =>
  normalize([
    input.project?.name,
    input.project?.objective,
    input.project?.scope,
    input.project?.description,
    ...input.processes.map((process) => `${process.name} ${process.description ?? ''}`),
    ...input.requirements.map((requirement) => `${requirement.description} ${requirement.acceptance_criteria}`),
    ...input.findings.map((finding) => finding.statement),
    ...(input.dataEntities ?? []).map((entity) => `${entity.name} ${entity.description ?? ''}`)
  ].join(' '));

const domainExecutionPolicyFor = (input: ImplementationSpecExportInput): DomainExecutionPolicy => {
  const corpus = sourceCorpus(input);
  if (/(hotel|pms|folio|habitacion|huesped|checkin|checkout|housekeeping|night audit|reserv)/.test(corpus)) {
    return {
      domainType: 'PMS / hotel operations',
      requiresDomainReasoning: true,
      requiresExternalResearch: true,
      researchTriggers: [
        'missing folio behavior',
        'missing room lifecycle rules',
        'missing front desk visibility rules',
        'missing housekeeping coordination details',
        'missing night audit or shift handoff behavior'
      ],
      operationalFocusAreas: [
        'reservation lifecycle',
        'front desk board behavior',
        'folio, deposit, payment, and balance handling',
        'room operational states and housekeeping coordination',
        'shift handoff and night audit controls'
      ],
      forbiddenSimplifications: [
        'generic reservation CRUD only',
        'front desk without folio visibility',
        'checkout without balance validation',
        'room assignment without operational state constraints'
      ]
    };
  }
  if (/(clinic|appointment|patient|doctor|cita|paciente|medic)/.test(corpus)) {
    return {
      domainType: 'Clinic / appointment operations',
      requiresDomainReasoning: true,
      requiresExternalResearch: true,
      researchTriggers: ['missing appointment lifecycle rules', 'missing role separation', 'missing patient flow behavior'],
      operationalFocusAreas: ['appointment scheduling', 'patient and practitioner roles', 'availability conflicts', 'check-in and service flow'],
      forbiddenSimplifications: ['generic appointment CRUD only', 'no conflict validation', 'no role-aware workflow']
    };
  }
  if (/(restaurant|mesa|order|kitchen|ticket|comanda|pos)/.test(corpus)) {
    return {
      domainType: 'Restaurant / POS operations',
      requiresDomainReasoning: true,
      requiresExternalResearch: true,
      researchTriggers: ['missing ticket state flow', 'missing kitchen workflow', 'missing payment split behavior'],
      operationalFocusAreas: ['order lifecycle', 'table occupancy', 'kitchen handoff', 'payment and closeout behavior'],
      forbiddenSimplifications: ['generic order CRUD only', 'no ticket states', 'no handoff between floor and kitchen']
    };
  }
  if (/(logistic|shipment|warehouse|tracking|delivery|inventory)/.test(corpus)) {
    return {
      domainType: 'Logistics / order tracking',
      requiresDomainReasoning: true,
      requiresExternalResearch: true,
      researchTriggers: ['missing status transitions', 'missing warehouse handoff rules', 'missing exception flow'],
      operationalFocusAreas: ['order lifecycle', 'tracking statuses', 'handoff points', 'inventory and fulfillment constraints'],
      forbiddenSimplifications: ['generic shipment CRUD only', 'no state transitions', 'no exception handling']
    };
  }
  return {
    domainType: 'Generic business system',
    requiresDomainReasoning: true,
    requiresExternalResearch: false,
    researchTriggers: ['operational gaps remain unresolved after reading requirements and process files'],
    operationalFocusAreas: ['state transitions', 'blocking rules', 'required visible data', 'daily operator workflows'],
    forbiddenSimplifications: ['raw CRUD as the only delivery shape', 'ignoring blocking rules or state-dependent behavior']
  };
};

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
        bottleneck?: string;
        handoffTo?: string;
        evidenceRef?: string;
        notes?: string;
      }>
    : [];
};

const stakeholderName = (input: ImplementationSpecExportInput, id: number | null | undefined, fallback?: string) => {
  const stakeholder = id ? input.stakeholders.find((item) => item.id === id) : null;
  return stakeholder ? `${stakeholder.name} (${stakeholder.role})` : text(fallback, 'Not specified');
};

const requirementHasEvidence = (input: ImplementationSpecExportInput, requirement: Requirement) => {
  const traceItem = input.useCases.find((useCase) => useCase.requirement.id === requirement.id);
  return Boolean(traceItem?.sourceFindings.length || requirement.finding_count > 0 || requirement.finding_ids?.length);
};

const extractCandidateEntities = (input: ImplementationSpecExportInput) => {
  const excluded = new Set([
    ...input.stakeholders.flatMap((stakeholder) => [
      toPascal(stakeholder.name),
      toPascal(stakeholder.role),
      ...stakeholder.role.split(/\s+/).map(toPascal)
    ]),
    ...(input.targetRoles ?? []).map((role) => toPascal(role.name)),
    'Analista',
    'AnalistaDeNegocio',
    'Recepcionista',
    'RecepcionistaAm',
    'RecepcionistaPm',
    'Auditor',
    'AuditorNocturno',
    'Gerente',
    'GerenteGeneral',
    'SupervisoraDeLimpieza',
    'Limpieza',
    'Stakeholder',
    'Usuario'
  ]);
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
  return unique(['User', ...ranked]).filter((name) => !excluded.has(name)).slice(0, 10);
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
      incomingRelations: name === 'Usuario' ? ['referenced by operational entities'] : ['created or updated by User'],
      source: confidence === 'LOW' ? 'Inferred from requirements, use cases, and findings' : 'Derived from actors/stakeholders/processes'
    };
  });
};

const implementationEntityNames = (input: ImplementationSpecExportInput) => {
  const manual = input.dataEntities ?? [];
  if (manual.length) {
    return manual.map((entity) => entity.name);
  }
  return inferEntities(input)
    .filter((entity) => entity.confidence !== 'LOW')
    .map((entity) => entity.name);
};

const outOfScopeFor = (input: ImplementationSpecExportInput) => {
  const scope = input.project?.scope ?? '';
  const explicit = scope.match(/(?:Excluye|Fuera del alcance|No contempla|No se contempla)[:\s]+(.+)$/i);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }
  const inline = scope.match(/(?:^|[.;]\s*)(?:Excluye|Fuera del alcance|No contempla|No se contempla)\s+(.+?)(?=$|[.;]\s*(?:Incluye|Alcance|Objetivo)\b)/i);
  if (inline?.[1]) {
    return inline[1].trim();
  }
  const sentence = scope
    .split(/(?<=[.!?])\s+/)
    .find((part) => /excluye|fuera del alcance|no contempla|no se contempla/i.test(part));
  return sentence?.trim() || '';
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
        title: `Manage ${requirement.code}`,
        requirement,
        actor: 'system user',
        action: requirement.description,
        benefit: 'fulfill the documented requirement',
        acceptanceCriteria: requirement.acceptance_criteria,
        sourceFindings: [] as Finding[]
      }));

const contractFor = (input: ImplementationSpecExportInput, requirementId: number) =>
  input.implementationContracts?.find((contract) => contract.requirementId === requirementId) ?? null;

const targetStackFor = (input: ImplementationSpecExportInput): TargetStack => input.targetStack ?? {
  architectureType: 'Pending definition in Target Stack',
  backendFramework: 'Pending',
  backendLanguage: 'Pending',
  backendOrm: 'Pending',
  backendDatabase: 'Pending',
  backendMigrations: 'Pending',
  backendAuth: 'Pending',
  backendTesting: 'Pending',
  frontendFramework: 'Pending',
  frontendLanguage: 'Pending',
  frontendUi: 'Pending',
  frontendRouting: 'Pending',
  frontendDataFetching: 'Pending',
  frontendState: 'Pending',
  frontendTesting: 'Pending',
  runMode: 'Pending',
  envVars: [],
  seedAdmin: 'Pending',
  commands: []
};


const fieldRows = (fields: { name: string; type: string; required?: boolean; description?: string; example?: string }[]) =>
  fields.map((field) => [
    field.name,
    field.type,
    field.required ? 'Yes' : 'No',
    field.description || '-',
    field.example || '-'
  ]);

const collectValidationIssues = (input: ImplementationSpecExportInput, entities = inferEntities(input)) => {
  const useCases = useCasesFor(input);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  if (!input.requirements.length) {
    errors.push({ code: 'NO_REQUIREMENTS', message: 'No requirements are registered to build implementable specs.' });
  }
  if (!useCases.length) {
    errors.push({ code: 'NO_USE_CASES', message: 'There are no use cases or sufficient requirements to derive them.' });
  }

  for (const requirement of input.requirements) {
    if (!requirementHasEvidence(input, requirement)) {
      warnings.push({
        code: 'REQUIREMENT_WITHOUT_EVIDENCE',
        message: `${requirement.code}: requirement without linked evidence or finding.`
      });
    }
    if (!input.useCases.some((useCase) => useCase.requirement.id === requirement.id && useCase.persistedId)) {
      warnings.push({
        code: 'REQUIREMENT_WITHOUT_USE_CASE',
        message: `${requirement.code}: the use case was inferred or is not persisted as a formal story/use case.`
      });
    }
  }

  for (const useCase of useCases) {
    if (!sessionsForUseCase(input, useCase).length) {
      warnings.push({
        code: 'USE_CASE_WITHOUT_PROCESS',
        message: `${useCase.title}: missing traceable process or session; a baseline inferred flow will be generated.`
      });
    }
  }

  if (!input.diagrams.length && !input.savedDiagrams.length) {
    warnings.push({ code: 'MISSING_DIAGRAMS', message: 'There are no saved or derived diagrams in the package.' });
  }

  const contracts = input.implementationContracts ?? [];
  for (const requirement of input.requirements) {
    const contract = contractFor(input, requirement.id);
    if (!contract) {
      warnings.push({ code: 'REQUIREMENT_WITHOUT_CONTRACT', message: `${requirement.code}: missing implementable technical contract.` });
      continue;
    }
    if (!contract.endpointPath) {
      warnings.push({ code: 'CONTRACT_WITHOUT_ENDPOINT', message: `${requirement.code}: contract without endpoint.` });
    }
    if (!contract.validations.length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_VALIDATIONS', message: `${requirement.code}: contract without validations.` });
    }
    if (!contract.expectedErrors.length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_EXPECTED_ERRORS', message: `${requirement.code}: contract without expected errors.` });
    }
    if (!(contract.blockingRules ?? []).length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_BLOCKING_RULES', message: `${requirement.code}: contract without blocking rules — document preconditions that prevent the operation.` });
    }
    if (!(contract.stateRules ?? []).length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_STATE_RULES', message: `${requirement.code}: contract without state lifecycle rules — document how the resource state changes.` });
    }
    if (!(contract.screenFields ?? []).length) {
      warnings.push({ code: 'CONTRACT_WITHOUT_SCREEN_FIELDS', message: `${requirement.code}: contract without required screen fields — document what the operator must see and interact with.` });
    }
  }
  if (contracts.length > 0 && contracts.every((c) => !(c.visibleColumns ?? []).length)) {
    warnings.push({ code: 'NO_VISIBLE_COLUMNS', message: 'No contract specifies visible list columns. Define what data must appear in table/list views.' });
  }
  if (!(input.dataEntities ?? []).length) {
    warnings.push({ code: 'NO_MANUAL_DATA_MODEL', message: 'No manual data-model entities were captured; inferred entities will be used.' });
  }
  for (const entity of input.dataEntities ?? []) {
    if (!entity.fields.length) {
      warnings.push({ code: 'ENTITY_WITHOUT_FIELDS', message: `${entity.name}: entity without defined fields.` });
    }
    if (entity.relationships.some((relationship) => !relationship.foreignKey && relationship.type !== 'many-to-many')) {
      warnings.push({ code: 'RELATION_WITHOUT_FK', message: `${entity.name}: relationship without suggested FK.` });
    }
  }
  if (!(input.targetRoles ?? []).length) {
    warnings.push({ code: 'NO_TARGET_ROLES', message: 'No roles or permissions were defined for the target system.' });
  }
  for (const role of input.targetRoles ?? []) {
    if (!role.permissions.length) {
      warnings.push({ code: 'ROLE_WITHOUT_PERMISSIONS', message: `${role.name}: role without permissions.` });
    }
  }
  const stack = targetStackFor(input);
  if (!stack.backendFramework || !stack.frontendFramework || !stack.backendDatabase || !stack.backendAuth) {
    warnings.push({ code: 'TARGET_STACK_INCOMPLETE', message: 'Target stack is incomplete: backend/frontend/database/auth must be defined.' });
  }

  if (!(input.dataEntities ?? []).length) {
    for (const entity of entities.filter((entity) => entity.confidence === 'LOW')) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `${entity.name}: low-confidence inferred entity; validate name, attributes, and relationships.`
      });
    }
  }

  for (const entity of implementationEntityNames(input)) {
    suggestions.push({
      code: 'CRUD_SUGGESTION',
      message: `Create a baseline CRUD for ${entity}: list, create, edit, logical delete, and detail view.`
    });
  }

  return { errors, warnings, suggestions };
};

export const buildAgentInstructionsMarkdown = (input: ImplementationSpecExportInput) => {
  const stack = targetStackFor(input);
  const policy = domainExecutionPolicyFor(input);
  return [
    '# Instructions for the implementation team',
    '',
    `Target system: **${projectName(input)}**`,
    `Generated from Specora: ${nowIso(input)}`,
    '',
    '## Mandatory reading order',
    '',
    'Read and use the files in this order:',
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
    '## Target stack',
    '',
    `- Backend: ${stack.backendFramework} + ${stack.backendLanguage}.`,
    `- ORM/persistence: ${stack.backendOrm || 'Not specified'} + ${stack.backendDatabase}.`,
    `- Migrations: ${stack.backendMigrations || 'Not specified'}.`,
    `- Frontend: ${stack.frontendFramework} + ${stack.frontendLanguage}.`,
    `- UI: ${stack.frontendUi || 'Not specified'}.`,
    `- Auth: ${stack.backendAuth || 'Not specified'}.`,
    '- API: module-level routers/controllers, separate schemas/DTOs, services with business rules, and baseline tests.',
    '',
    '## Implementation strategy',
    '',
    '- Implement from domain to interface: entities, models, migrations, services, endpoints, and UI.',
    '- Do not treat inferred information as final when the validation report flags low confidence or missing evidence.',
    '- Any inferred output must stay easy to adjust in code: clear names, small services, and reusable components.',
    '- Keep full CRUD for core entities and guided workflows for primary use cases.',
    '- Every endpoint must validate permissions, payload shape, and business state before persisting.',
    '',
    '## Domain execution policy',
    '',
    `- Domain type: ${policy.domainType}.`,
    `- Domain-aware reasoning required: ${policy.requiresDomainReasoning ? 'Yes' : 'No'}.`,
    `- External research expected when operational gaps remain: ${policy.requiresExternalResearch ? 'Yes' : 'No'}.`,
    '- Do not reduce operational systems to generic CRUD when the domain implies dashboards, blocking rules, state transitions, financial behavior, or handoff workflows.',
    '- Any inferred behavior must be traceable to explicit specs, traced findings/evidence, domain-standard behavior, or a clearly labeled assumption.',
    '',
    '### Research triggers',
    '',
    bulletList(policy.researchTriggers),
    '',
    '### Operational focus areas',
    '',
    bulletList(policy.operationalFocusAreas),
    '',
    '### Forbidden simplifications',
    '',
    bulletList(policy.forbiddenSimplifications),
    '',
    '## Final checklist',
    '',
    `- Backend starts with: ${stack.commands.find((command) => command.toLowerCase().includes('backend')) || 'backend command defined in 04_ARCHITECTURE.md'}.`,
    `- Migrations: ${stack.backendMigrations || 'define if applicable'}.`,
    `- Admin seed: ${stack.seedAdmin || 'define initial user'}.`,
    `- Frontend starts with: ${stack.commands.find((command) => command.toLowerCase().includes('frontend')) || 'frontend command defined in 04_ARCHITECTURE.md'}.`,
    '- Login/authorization works when the system requires roles.',
    '- Core CRUD and primary use cases work end to end.',
    '- UI follows `07_DESIGN.md` and avoids flat CRUD-only screens.',
    '- Warnings from `08_VALIDATION_REPORT.md` were reviewed or explicitly documented.'
  ].join('\n');
};

export const buildRequirementsMarkdown = (input: ImplementationSpecExportInput) => {
  const useCases = useCasesFor(input);
  const entities = input.dataEntities?.length
    ? input.dataEntities.map((entity) => ({
        name: entity.name,
        tableName: entity.tableName,
        confidence: entity.confidence.toUpperCase(),
        source: entity.source
      }))
    : inferEntities(input);
  const roles = input.targetRoles ?? [];
  const outOfScope = outOfScopeFor(input);
  return [
    '# System requirements',
    '',
    '## System name',
    '',
    projectName(input),
    '',
    '## General description',
    '',
    text(input.project?.description ?? input.project?.objective, 'Description inferred from the project captured in Specora.'),
    '',
    '## Problem statement',
    '',
    text(input.project?.objective, 'Pending a clearer problem statement in the project context.'),
    '',
    '## Included scope',
    '',
    text(input.project?.scope, 'Pending separation between mandatory and optional functionality.'),
    '',
    '## Out of scope',
    '',
    text(outOfScope, 'Not specified. The team should confirm what remains out of scope before implementation.'),
    '',
    '## Actors',
    '',
    bulletList(actorsFor(input)),
    '',
    '## Target roles and permissions',
    '',
    roles.length
      ? markdownTable(
          ['Role', 'Type', 'Permissions', 'Screens', 'Endpoints'],
          roles.map((role) => [
            role.name,
            role.userType || '-',
            role.permissions.join('<br>') || '-',
            role.screens.join('<br>') || '-',
            role.endpoints.join('<br>') || '-'
          ])
        )
      : '- No target roles captured yet. Define Admin/User/etc. before closing implementation.',
    '',
    '## Detailed use cases',
    '',
    ...useCases.map((useCase, index) =>
      [
        `### CU-${index + 1}: ${useCase.title}`,
        '',
        `- Source requirement: ${useCase.requirement.code}`,
        `- Primary actor: ${useCase.actor}`,
        `- Goal: ${useCase.action}`,
        `- Expected benefit: ${useCase.benefit}`,
        `- Priority: ${useCase.requirement.priority}`,
        `- Type: ${useCase.requirement.type}`,
        '',
        '#### Acceptance criteria',
        '',
        text(useCase.acceptanceCriteria || useCase.requirement.acceptance_criteria, 'Pending detail.'),
        '',
        '#### Related flows',
        '',
        bulletList(sessionsForUseCase(input, useCase).map(sessionLabel), '- Basic inferred flow; missing traceable process/session.'),
        '',
        '#### Evidence traceability',
        '',
        bulletList(
          useCase.sourceFindings.map((finding) => {
            const session = input.sessions.find((item) => item.id === finding.session_id);
            const process = session?.process_id ? input.processes.find((item) => item.id === session.process_id) : null;
            const transaction = session && isTransactionSession(session) ? `; transaction tracking ${session.metadata?.['transactionId'] ?? session.title}` : '';
            return `${finding.statement} -> ${useCase.requirement.code}${process ? ` -> process ${process.name}` : ''}${transaction}`;
          }),
          '- No linked findings or evidence.'
        ),
        '',
        '#### Technical contract',
        '',
        (() => {
          const contract = contractFor(input, useCase.requirement.id);
          return contract
            ? [
                `- Screen: ${text(contract.screenName, 'Not specified')}`,
                `- UI route: ${text(contract.routePath, 'Not specified')}`,
                `- Endpoint: ${text(`${contract.endpointMethod ?? ''} ${contract.endpointPath ?? ''}`.trim(), 'Not specified')}`,
                '',
                '##### Request fields',
                markdownTable(['Field', 'Type', 'Required', 'Description', 'Example'], fieldRows(contract.requestFields)),
                '',
                '##### Response fields',
                markdownTable(['Field', 'Type', 'Required', 'Description', 'Example'], fieldRows(contract.responseFields)),
                '',
                '##### Business rules',
                bulletList(contract.businessRules, '- Pending'),
                '',
                '##### Blocking rules',
                bulletList((contract.blockingRules ?? []), '- None captured. Document preconditions that prevent the operation from proceeding.'),
                '',
                '##### State lifecycle rules',
                bulletList((contract.stateRules ?? []), '- None captured. Document how the resource state changes through this operation.'),
                '',
                '##### Required visible data',
                bulletList((contract.requiredVisibleData ?? []), '- None captured. Document what the operator must see to act on this screen.'),
                '',
                '##### Validations',
                bulletList(contract.validations, '- Pending'),
                '',
                '##### Expected errors',
                markdownTable(
                  ['HTTP', 'Condition', 'Message'],
                  contract.expectedErrors.map((error) => [String(error.statusCode), error.condition, error.message])
                ),
                '',
                '##### Permissions',
                bulletList(contract.permissions, '- Pending'),
                '',
                '##### Test cases',
                bulletList(contract.testCases, '- Pending'),
                '',
                '##### Required screen fields',
                bulletList((contract.screenFields ?? []), '- None captured. Document the fields the operator must see and interact with on this screen.'),
                '',
                '##### Visible list columns',
                bulletList((contract.visibleColumns ?? []), '- None captured. Document what columns must be visible in the list or table view.'),
                '',
                '##### Quick actions',
                bulletList((contract.quickActions ?? []), '- None captured.'),
                '',
                '##### Filters',
                bulletList((contract.filters ?? []), '- None captured.'),
                '',
                '##### Side effects',
                bulletList((contract.sideEffects ?? []), '- None captured. Document state changes or downstream effects triggered by this operation.'),
                '',
                '##### UI behavior on errors',
                bulletList((contract.uiErrorBehavior ?? []), '- None captured. Document how the interface should react to each expected error.')
              ].join('\n')
            : '_Warning: missing manual technical contract for this requirement._';
        })()
      ].join('\n')
    ),
    '',
    '## Use case relationship matrix',
    '',
    markdownTable(
      ['Use case', 'Requirement', 'Evidence', 'Technical contract'],
      useCases.map((useCase, index) => [
        `CU-${index + 1}`,
        useCase.requirement.code,
        useCase.sourceFindings.length ? `${useCase.sourceFindings.length} finding(s)` : 'No evidence',
        contractFor(input, useCase.requirement.id)?.endpointPath ?? 'No contract'
      ])
    ),
    '',
    '## Involved business entities',
    '',
    markdownTable(
      ['Entity', 'Suggested table', 'Confidence', 'Source'],
      entities.map((entity) => [entity.name, entity.tableName, entity.confidence, entity.source])
    )
  ].join('\n');
};

export const buildClassModelMarkdown = (input: ImplementationSpecExportInput) => {
  const entities = inferEntities(input);
  const manualEntities = input.dataEntities ?? [];
  if (manualEntities.length > 0) {
    const manualEntityNames = new Set(manualEntities.map((entity) => normalize(entity.name)));
    const inferredAdditional = entities.filter(
      (entity) => entity.confidence !== 'LOW' && !manualEntityNames.has(normalize(entity.name))
    );
    return [
      '# Class and data model',
      '',
      'This model prioritizes entities captured manually in Specora. The relationships and integrity rules described here should be implemented in models, migrations, and services.',
      '',
      '## Summary of manual entities',
      '',
      markdownTable(
        ['Entity', 'Table', 'Source', 'Confidence', 'Fields', 'Relationships'],
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
          `- Table: \`${entity.tableName}\``,
          `- Source: ${entity.source}`,
          `- Confidence: ${entity.confidence}`,
          `- Description: ${text(entity.description, 'Not specified')}`,
          '',
          '### Fields',
          '',
          markdownTable(
            ['Field', 'Type', 'Required', 'Unique', 'Nullable', 'Default', 'Example', 'Description'],
            entity.fields.map((field) => [
              field.name,
              field.type,
              field.required ? 'Yes' : 'No',
              field.unique ? 'Yes' : 'No',
              field.nullable ? 'Yes' : 'No',
              field.defaultValue || '-',
              field.example || '-',
              field.description || '-'
            ])
          ),
          '',
          '### Relationships',
          '',
          markdownTable(
            ['Source', 'Type', 'Target', 'Suggested FK', 'On delete', 'Description'],
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
          '### Integrity rules',
          '',
          bulletList(entity.integrityRules, '- No captured integrity rules.')
        ].join('\n')
      ),
      '',
      '## Additional inferred entities',
      '',
      inferredAdditional.length
        ? markdownTable(
            ['Entity', 'Table', 'Confidence', 'Source'],
            inferredAdditional.map((entity) => [entity.name, entity.tableName, entity.confidence, entity.source])
          )
        : '- No inferred entities were added. The manual model is the primary source.'
    ].join('\n');
  }
  return [
    '# Class model',
    '',
    'This model combines captured data and heuristics. Entities marked as `LOW` must be validated before implementing final migrations.',
    '',
    '## Entity summary',
    '',
    markdownTable(
      ['Entity', 'Table', 'Confidence', 'Main attributes'],
      entities.map((entity) => [entity.name, entity.tableName, `${entity.confidence} (${entity.confidenceScore}%)`, entity.attributes.join(', ')])
    ),
    '',
    ...entities.map((entity) =>
      [
        `## ${entity.name}`,
        '',
        `- Table: \`${entity.tableName}\``,
        `- Confidence: ${entity.confidence} (${entity.confidenceScore}%)`,
        `- Source: ${entity.source}`,
        '',
        '### Attributes',
        '',
        bulletList(entity.attributes.map((attribute) => `\`${attribute}\``)),
        '',
        '### Suggested methods',
        '',
        bulletList(entity.methods.map((method) => `\`${method}()\``)),
        '',
        '### Outgoing relationships',
        '',
        bulletList(entity.outgoingRelations),
        '',
        '### Incoming relationships',
        '',
        bulletList(entity.incomingRelations)
      ].join('\n')
    ),
    '',
    '## Relationship matrix',
    '',
    markdownTable(
      ['Source', 'Relationship', 'Target', 'Type'],
      entities.flatMap((entity) =>
        entity.outgoingRelations.map((relation) => [
          entity.name,
          relation,
          entity.name === 'Usuario' ? relation.replace('gestiona ', '') : 'User',
          entity.confidence === 'LOW' ? 'Inferred' : 'Recommended'
        ])
      )
    )
  ].join('\n');
};

export const buildArchitectureMarkdown = (input: ImplementationSpecExportInput) => {
  const stack = targetStackFor(input);
  return [
    '# Target architecture',
    '',
    `System: ${projectName(input)}`,
    `Architecture type: ${stack.architectureType}`,
    '',
    '## Backend target',
    '',
    `- Framework: ${stack.backendFramework}.`,
    `- Language: ${stack.backendLanguage}.`,
    `- ORM: ${stack.backendOrm || 'Not specified'}.`,
    `- Migrations: ${stack.backendMigrations || 'Not specified'}.`,
    `- Database: ${stack.backendDatabase}.`,
    `- Auth: ${stack.backendAuth || 'Not specified'}.`,
    `- Testing: ${stack.backendTesting || 'Not specified'}.`,
    '- Layers: controllers/routers, DTOs/schemas, services, repositories when they add clarity, entities/models, and centralized configuration.',
    '',
    '## Frontend target',
    '',
    `- Framework/build: ${stack.frontendFramework}.`,
    `- Language: ${stack.frontendLanguage}.`,
    `- UI library: ${stack.frontendUi || 'Not specified'}.`,
    `- Routing: ${stack.frontendRouting || 'Not specified'}.`,
    `- Data fetching: ${stack.frontendDataFetching || 'Not specified'}.`,
    `- State: ${stack.frontendState || 'Not specified'}.`,
    `- Testing: ${stack.frontendTesting || 'Not specified'}.`,
    '',
    '## Implementation rules',
    '',
    '- Every entity should have an input contract, an output contract, and a service/use-case layer.',
    '- Endpoints should use clear REST naming: `GET /api/<resource>`, `POST`, `PATCH`, `DELETE` when appropriate.',
    '- Validation errors should return HTTP 400/422 with actionable messages.',
    '- Screens should not expose raw CRUD tables as the primary experience; use workflows, filters, empty states, and detail panels.',
    '- The frontend should centralize loading, error, and empty states.',
    '- Every important use case should have a visible route or action.',
    '',
    '## Local execution and infrastructure',
    '',
    `- Mode: ${stack.runMode || 'Not specified'}`,
    `- Admin seed: ${stack.seedAdmin || 'Not specified'}`,
    '',
    '### Environment variables',
    '',
    bulletList(stack.envVars.map((item) => `\`${item}\``), '- Pending'),
    '',
    '### Expected commands',
    '',
    bulletList(stack.commands.map((item) => `\`${item}\``), '- Pending')
  ].join('\n');
};

export const buildProcessMarkdown = (input: ImplementationSpecExportInput) => {
  const useCases = useCasesFor(input);
  const transactionSessions = input.sessions.filter(isTransactionSession);
  const stack = targetStackFor(input);
  return [
    '# Processes and flows',
    '',
    'Each flow includes source, target, action, layer, and implementation hints to guide the delivery team.',
    '',
    '## Registered processes',
    '',
    markdownTable(
      ['Process', 'Description', 'Real transaction samples'],
      input.processes.map((process) => [
        process.name,
        process.description ?? 'No description',
        String(transactionSessions.filter((session) => session.process_id === process.id).length)
      ])
    ),
    '',
    '## Transaction tracking sessions',
    '',
    transactionSessions.length
      ? transactionSessions.map((session) => {
          const steps = transactionStepsFor(session);
          const process = input.processes.find((item) => item.id === session.process_id);
          const metrics = session.metadata?.['metrics'] as Record<string, unknown> | undefined;
          return [
            `### ${session.title}`,
            '',
            `- Process: ${process?.name ?? 'Not linked'}`,
            `- Transaction: ${text(String(session.metadata?.['transactionId'] ?? ''), 'Not specified')}`,
            `- Type: ${text(String(session.metadata?.['transactionType'] ?? ''), 'Not specified')}`,
            `- Final status: ${text(String(session.metadata?.['finalStatus'] ?? ''), 'Not specified')}`,
            `- Systems/channels: ${Array.isArray(session.metadata?.['systemsInvolved']) ? (session.metadata['systemsInvolved'] as string[]).join(', ') : 'Not specified'}`,
            metrics ? `- Total time: ${text(String(metrics['totalTime'] ?? ''), 'Not specified')}` : '',
            metrics ? `- Deviation: ${text(String(metrics['deviation'] ?? ''), 'Not specified')}` : '',
            '',
            steps.length
              ? markdownTable(
                  ['Step', 'Actor', 'System/channel', 'Input', 'Action', 'Output', 'Time', 'Issue', 'Bottleneck', 'Handoff to'],
                  steps.map((step, index) => [
                    `${step.order ?? index + 1}. ${text(step.name, 'Unnamed step')}`,
                    stakeholderName(input, step.actorStakeholderId, step.actorRole),
                    [step.system, step.channel].filter(Boolean).join(' / ') || 'Not specified',
                    step.input ?? '-',
                    step.action ?? '-',
                    step.output ?? '-',
                    [step.duration, step.waitTime ? `wait ${step.waitTime}` : ''].filter(Boolean).join(', ') || '-',
                    step.issue ?? '-',
                    step.bottleneck || '-',
                    step.handoffTo || '-'
                  ])
                )
              : '_Warning: transaction tracking session without observed steps._'
          ].filter(Boolean).join('\n');
        }).join('\n\n')
      : '_No transaction tracking sessions registered. Use-case flows are shown as baseline inferences._',
    '',
    ...useCases.map((useCase, index) => {
      const linkedSessions = sessionsForUseCase(input, useCase);
      const processRows = linkedSessions.length
        ? linkedSessions.map((session, stepIndex) => [
            String(stepIndex + 1),
            useCase.actor,
            'System',
            sessionLabel(session),
            'Application',
            `Use data from trace_session ${session.id}; validate relationships and evidence.`
          ])
        : [
            ['1', useCase.actor, 'Frontend', `Start ${useCase.title}`, 'UI', 'Create a guided form and validate required fields.'],
            ['2', 'Frontend', 'Backend API', 'Send validated payload', 'API', 'Use Axios + TanStack Query mutation.'],
            ['3', 'Backend API', 'Domain service', 'Validate requirement rules', 'Service', `Apply the acceptance criteria of ${useCase.requirement.code}.`],
            ['4', 'Domain service', stack.backendDatabase || 'Database', 'Persist changes', 'DB', `Use ${stack.backendOrm || 'the persistence layer'} with a short transaction.`],
            ['5', 'Backend API', useCase.actor, 'Return result', 'UI', 'Show resulting state, detail, and next action.']
          ];
      return [
        `## Process ${index + 1}: ${useCase.title}`,
        '',
        `- Use case: CU-${index + 1}`,
        `- Requirement: ${useCase.requirement.code}`,
        `- Source: ${linkedSessions.length ? 'Traceable sessions/findings' : 'Inference due to missing step-by-step process data'}`,
        '',
        markdownTable(['Step', 'Source', 'Target', 'Action', 'Layer', 'Implementation hint'], processRows),
        '',
        '### Required validations',
        '',
        bulletList([
          'User is authenticated with JWT when the route is not public.',
          `Payload satisfies the acceptance criteria of ${useCase.requirement.code}.`,
          'Referenced relationships exist before persistence.',
          'Errors are shown in the UI with a clear message.'
        ]),
        '',
        '### Affected entities',
        '',
        bulletList(implementationEntityNames(input).slice(0, 6), '- Pending validation against the data model.')
      ].join('\n');
    })
  ].join('\n');
};

export const buildExecutionMarkdown = (input: ImplementationSpecExportInput) => {
  const stack = targetStackFor(input);
  const policy = domainExecutionPolicyFor(input);
  return [
    '# Execution plan',
    '',
    '## Phase 1: Read and plan',
    '',
    '- Read files 01 to 08 in order.',
    '- Identify blocking issues from the validation report.',
    '- Confirm final entities before migrations when `LOW_CONFIDENCE` markers exist.',
    `- Apply domain-aware reasoning for ${policy.domainType}.`,
    ...(policy.requiresExternalResearch
      ? ['- If operational gaps remain after reading the package, perform targeted external research before finalizing workflows, state transitions, or required visible fields.']
      : []),
    '',
    '## Phase 2: Backend setup',
    '',
    `- Create the backend project with ${stack.backendFramework} (${stack.backendLanguage}).`,
    `- Configure ${stack.backendOrm || 'the persistence layer'}, ${stack.backendDatabase}, ${stack.backendMigrations || 'migrations if applicable'}, settings, and CORS.`,
    `- Implement ${stack.backendAuth || 'the authentication mechanism defined in architecture'} and the admin seed.`,
    '',
    '## Phase 3: Backend API',
    '',
    '- Implement models and migrations.',
    '- Add request/response schemas or DTOs.',
    '- Build routers/controllers and services per entity and use case.',
    '- Add baseline auth and core CRUD tests.',
    '',
    '## Phase 4: Frontend setup',
    '',
    `- Create the frontend with ${stack.frontendFramework} (${stack.frontendLanguage}).`,
    `- Install/configure ${[stack.frontendUi, stack.frontendRouting, stack.frontendDataFetching, stack.frontendState].filter(Boolean).join(', ') || 'the frontend libraries defined in architecture'}.`,
    '- Configure the protected layout, login flow, and API client.',
    '',
    '## Phase 5: Features and routes',
    '',
    '- Implement the operational dashboard.',
    '- Implement entity CRUD.',
    '- Implement the primary flows described in `05_PROCESS.md`.',
    '- Respect domain-specific blocking rules, visibility rules, and state transitions before calling the implementation complete.',
    '',
    '## Phase 6: UX/UI',
    '',
    '- Apply the visual system from `07_DESIGN.md`.',
    '- Add empty states, badges, save feedback, loading states, and error handling.',
    '- Avoid screens where a raw table is the only interaction model.',
    '',
    '## Phase 7: Final verification',
    '',
    `- Run backend tests: ${stack.backendTesting || 'according to the selected stack'}.`,
    `- Run frontend tests/build: ${stack.frontendTesting || 'according to the selected stack'}.`,
    '- Verify login, navigation, and CRUD flows.',
    '- Verify that the result behaves like the target domain operation, not only like a technically correct entity manager.',
    '- Review any remaining warnings.',
    '',
    '## Phase 8: CRUD integration',
    '',
    '- Validate create, list, edit, and delete/logical-delete behavior per entity.',
    '- Validate that every use case has a visible action and real persistence.',
    '',
    '## Domain verification gates',
    '',
    bulletList([
      `Confirm visible operational data for ${policy.domainType} is not hidden behind secondary screens.`,
      'Confirm blocking rules and override rules are enforced where the process requires them.',
      'Confirm state transitions match the real operational lifecycle, not only enum storage.',
      ...(policy.requiresExternalResearch ? ['Document any external domain assumptions used to close operational gaps.'] : [])
    ])
  ].join('\n');
};

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
  const hasStitchInputs = inputs.length > 0;
  return [
    '# Design system and experience',
    '',
    hasStitchInputs
      ? 'The visual system is defined by the imported Stitch file(s) below. The implementation team must follow those references as the primary source of truth and validate that they satisfy accessibility, responsive behavior, and functional requirements.'
      : 'The interface should feel close to Vercel, Figma, Linear, Raycast, and Stripe: restrained, fast, precise, and professional.',
    '',
    '## Imported design instructions',
    '',
    hasStitchInputs
      ? 'This section includes manual guidelines imported into Specora, such as `.md` files generated by Stitch. The implementation team should treat them as high-priority references, validating that they do not contradict functional requirements, accessibility, or scope.'
      : 'No design files were imported. Use the baseline rules in this document and manually validate the main screens.',
    '',
    ...inputs.flatMap((file, index) => [
      `### Source ${index + 1}: ${file.path}`,
      '',
      '```md',
      file.content.slice(0, 12000),
      file.content.length > 12000 ? '\n<!-- Content trimmed due to length. Review the full source file in the project package. -->' : '',
      '```',
      ''
    ]),
    ...(hasStitchInputs ? [] : [
      '## Base palette',
      '',
      '- Base: zinc/neutral (`#09090b`, `#18181b`, `#27272a`, `#71717a`, `#e4e4e7`, `#fafafa`).',
      '- Primary accent: restrained blue or indigo for primary actions.',
      '- States: green for success, amber for warning, red for error.',
      '',
      '## Components',
      '',
      '- `PageHeader`: title, short description, and primary actions.',
      '- `Card`: maximum 8px radius, subtle border, consistent padding.',
      '- `Button`: primary, secondary, ghost, and danger variants, with icon when appropriate.',
      '- `Input`: visible label, short help text, inline error.',
      '- `Badge`: compact status token with sufficient contrast.',
      '- `EmptyState`: short message, next action, and no heavy decorative illustration.',
      '- `DataToolbar`: search, filters, and sorting.',
      '',
      '## Layout',
      '',
      '- Stable sidebar for primary modules.',
      '- Controlled content max-width, but tables and workbenches may use full width.',
      '- Responsive from mobile upward: single-column forms, grouped actions.',
      '- Enterprise density: less hero, more scannable information.',
      '',
      '## Visual quality rules',
      '',
      '- Avoid ugly CRUD: each list must have search, filters, state, a primary action, and detail access.',
      '- Do not place cards inside cards.',
      '- Text must not overflow buttons, badges, or tables.',
      '- Every screen must make the next action obvious.'
    ])
  ].join('\n');
};

export const buildValidationReportMarkdown = (input: ImplementationSpecExportInput) => {
  const entities = inferEntities(input);
  const issues = collectValidationIssues(input, entities);
  const readiness = readinessFor(input);
  const policy = domainExecutionPolicyFor(input);
  return [
    '# Validation report',
    '',
    `System: ${projectName(input)}`,
    `Generated: ${nowIso(input)}`,
    `Readiness score: ${readiness.score}/100`,
    `Status: ${readiness.status}`,
    '',
    '## Errors',
    '',
    bulletList(
      [
        ...readiness.errors.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.errors.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- No blocking errors detected.'
    ),
    '',
    '## Warnings',
    '',
    bulletList(
      [
        ...readiness.warnings.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.warnings.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- No warnings detected.'
    ),
    '',
    '## Suggestions',
    '',
    bulletList(
      [
        ...readiness.suggestions.map((issue) => `[${issue.code}] ${issue.title}: ${issue.description}`),
        ...issues.suggestions.map((issue) => `[${issue.code}] ${issue.message}`)
      ],
      '- No additional suggestions.'
    ),
    '',
    '## Missing items matrix',
    '',
    markdownTable(
      ['Severity', 'Code', 'Module', 'Action'],
      [...readiness.errors, ...readiness.warnings, ...readiness.suggestions].map((issue) => [
        issue.severity,
        issue.code,
        issue.module,
        issue.actionLabel
      ])
    ),
    '',
    '## Traceability coverage',
    '',
    markdownTable(
      ['Element', 'Total'],
      [
        ['Stakeholders', String(input.stakeholders.length)],
        ['Sessions', String(input.sessions.length)],
        ['Findings', String(input.findings.length)],
        ['Requirements', String(input.requirements.length)],
        ['Use cases', String(useCasesFor(input).length)],
        ['Technical contracts', String(input.implementationContracts?.length ?? 0)],
        ['Manual entities', String(input.dataEntities?.length ?? 0)],
        ['Target roles', String(input.targetRoles?.length ?? 0)],
        ['Imported design inputs', String(input.designInputs?.length ?? 0)],
        ['Derived diagrams', String(input.diagrams.length)],
        ['Saved diagrams', String(input.savedDiagrams.length)]
      ]
    ),
    '',
    '## Evaluatable checklist',
    '',
    bulletList([
      'Backend runs locally with documented commands.',
      'Frontend runs locally with documented commands.',
      'Login/authentication works when the system requires roles.',
      'Core CRUD is complete for central entities.',
      'Business validations are implemented in the backend.',
      'HTTP 400/401/403/404/409/422 errors are documented where applicable.',
      'README includes installation, seed, and usage examples.',
      'Baseline API and primary flow tests exist.',
      `Implementation was reviewed against the operational expectations of ${policy.domainType}.`
    ]),
    '',
    '## Domain execution policy',
    '',
    `- Domain type: ${policy.domainType}`,
    `- Domain-aware reasoning required: ${policy.requiresDomainReasoning ? 'Yes' : 'No'}`,
    `- External research expected on gaps: ${policy.requiresExternalResearch ? 'Yes' : 'No'}`,
    '',
    '### Research triggers',
    '',
    bulletList(policy.researchTriggers),
    '',
    '### Operational focus areas',
    '',
    bulletList(policy.operationalFocusAreas),
    '',
    '### Forbidden simplifications',
    '',
    bulletList(policy.forbiddenSimplifications)
  ].join('\n');
};

export const buildImplementationSpecFiles = (input: ImplementationSpecExportInput): ImplementationSpecFile[] => [
  { path: '01_AGENT_INSTRUCTIONS.md', content: buildAgentInstructionsMarkdown(input) },
  { path: '02_REQUIREMENTS.md', content: buildRequirementsMarkdown(input) },
  { path: '03_CLASS_MODEL.md', content: buildClassModelMarkdown(input) },
  { path: '04_ARCHITECTURE.md', content: buildArchitectureMarkdown(input) },
  { path: '05_PROCESS.md', content: buildProcessMarkdown(input) },
  { path: '06_EXECUTION.md', content: buildExecutionMarkdown(input) },
  { path: '07_DESIGN.md', content: buildDesignMarkdown(input) },
  { path: '08_VALIDATION_REPORT.md', content: buildValidationReportMarkdown(input) }
];
