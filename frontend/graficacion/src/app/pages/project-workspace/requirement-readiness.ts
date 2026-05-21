import type { Process } from '../../services/processes.service';
import type { Project } from '../../services/projects.service';
import type { Finding, Requirement, Session, Stakeholder } from '../../services/traceability.service';
import type {
  DataEntitySpec,
  DerivedDiagram,
  DerivedSpec,
  DerivedUseCase,
  ImplementationContract,
  ModuleKey,
  SavedDiagramEntry,
  TargetRoleSpec,
  TargetStack
} from './project-workspace.models';

export type ReadinessStatus = 'incompleto' | 'analizable' | 'documentado' | 'implementable' | 'listo_para_entrega';

export type ReadinessIssue = {
  severity: 'error' | 'warning' | 'suggestion';
  code: string;
  title: string;
  description: string;
  module: ModuleKey;
  actionLabel: string;
};

export type RequirementReadiness = {
  score: number;
  status: ReadinessStatus;
  errors: ReadinessIssue[];
  warnings: ReadinessIssue[];
  suggestions: ReadinessIssue[];
};

export type RequirementReadinessInput = {
  project: Project | null;
  stakeholders: Stakeholder[];
  processes: Process[];
  sessions: Session[];
  findings: Finding[];
  requirements: Requirement[];
  useCases: DerivedUseCase[];
  specs: DerivedSpec[];
  diagrams: DerivedDiagram[];
  savedDiagrams: SavedDiagramEntry[];
  targetStack?: TargetStack;
  implementationContracts?: ImplementationContract[];
  dataEntities?: DataEntitySpec[];
  targetRoles?: TargetRoleSpec[];
};

const issue = (
  severity: ReadinessIssue['severity'],
  code: string,
  title: string,
  description: string,
  module: ModuleKey,
  actionLabel: string
): ReadinessIssue => ({ severity, code, title, description, module, actionLabel });

const statusForScore = (score: number, errorCount: number): ReadinessStatus => {
  if (errorCount > 0 || score < 30) return 'incompleto';
  if (score < 50) return 'analizable';
  if (score < 72) return 'documentado';
  if (score < 90) return 'implementable';
  return 'listo_para_entrega';
};

const isTransactionSession = (session: Session) =>
  session.technique_code === 'transaction_tracking' ||
  /seguimiento|transaccional|transaction/i.test(`${session.technique} ${session.title}`);

const transactionSteps = (session: Session): Array<{ actorStakeholderId?: number | null; actorRole?: string; issue?: string }> => {
  const steps = session.metadata?.['steps'];
  return Array.isArray(steps) ? steps as Array<{ actorStakeholderId?: number | null; actorRole?: string; issue?: string }> : [];
};

export const buildRequirementReadiness = (input: RequirementReadinessInput): RequirementReadiness => {
  const errors: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const suggestions: ReadinessIssue[] = [];
  const linkedFindingIds = new Set(input.requirements.flatMap((requirement) => requirement.finding_ids ?? []));
  const requirementsWithEvidence = input.requirements.filter((requirement) => requirement.finding_count > 0 || (requirement.finding_ids?.length ?? 0) > 0);
  const requirementsWithUseCase = input.requirements.filter((requirement) =>
    input.useCases.some((useCase) => useCase.requirement.id === requirement.id)
  );
  const requirementsWithPersistedUseCase = input.requirements.filter((requirement) =>
    input.useCases.some((useCase) => useCase.requirement.id === requirement.id && useCase.persistedId)
  );
  const useCasesWithCriteria = input.useCases.filter((useCase) => useCase.acceptanceCriteria.trim().length >= 12);
  const requirementsWithProcess = input.requirements.filter((requirement) =>
    input.useCases.some((useCase) => useCase.requirement.id === requirement.id && useCase.sourceFindings.some((finding) => Boolean(finding.session_title)))
  );
  const diagramCount = input.diagrams.length + input.savedDiagrams.length;
  const transactionSessions = input.sessions.filter(isTransactionSession);
  const processIdsWithTransaction = new Set(transactionSessions.map((session) => session.process_id).filter((id): id is number => typeof id === 'number'));
  const contracts = input.implementationContracts ?? [];
  const contractRequirementIds = new Set(contracts.map((contract) => contract.requirementId));
  const requirementsWithoutContract = input.requirements.filter((requirement) => !contractRequirementIds.has(requirement.id)).length;
  const contractsWithoutEndpoint = contracts.filter((contract) => !contract.endpointPath).length;
  const contractsWithoutValidations = contracts.filter((contract) => contract.validations.length === 0).length;
  const contractsWithoutErrors = contracts.filter((contract) => contract.expectedErrors.length === 0).length;
  const entities = input.dataEntities ?? [];
  const roles = input.targetRoles ?? [];
  const stack = input.targetStack;

  if (!input.project?.name || !(input.project.objective || input.project.description)) {
    errors.push(issue('error', 'PROJECT_CONTEXT_MISSING', 'Contexto incompleto', 'Falta nombre, objetivo o descripcion suficiente del proyecto.', 'context', 'Completar contexto'));
  }
  if (input.stakeholders.length === 0) {
    errors.push(issue('error', 'NO_STAKEHOLDERS', 'Sin stakeholders', 'Registra al menos un stakeholder fuente antes de cerrar specs.', 'stakeholders', 'Agregar stakeholder'));
  }
  if (input.requirements.length === 0) {
    errors.push(issue('error', 'NO_REQUIREMENTS', 'Sin requisitos', 'No se puede exportar un paquete implementable sin requisitos.', 'requirements', 'Crear requisito'));
  }

  if (input.processes.length === 0) {
    warnings.push(issue('warning', 'NO_PROCESSES', 'Sin procesos', 'Faltan procesos o subprocesos para explicar flujos reales.', 'processes', 'Documentar procesos'));
  }
  const processesWithoutTransaction = input.processes.filter((process) => !processIdsWithTransaction.has(process.id)).length;
  if (input.processes.length > 0 && processesWithoutTransaction > 0) {
    warnings.push(issue('warning', 'PROCESS_WITHOUT_TRANSACTION_SAMPLE', 'Procesos sin muestra real', `${processesWithoutTransaction} proceso(s) no tienen seguimiento transaccional observado.`, 'techniques', 'Registrar seguimiento'));
  }
  for (const session of transactionSessions) {
    const steps = transactionSteps(session);
    if (!session.process_id) {
      warnings.push(issue('warning', 'TRANSACTION_WITHOUT_PROCESS', 'Seguimiento sin proceso', `${session.title} no esta vinculado a un proceso.`, 'techniques', 'Seleccionar proceso'));
    }
    if (steps.length === 0) {
      warnings.push(issue('warning', 'TRANSACTION_WITHOUT_STEPS', 'Seguimiento sin pasos', `${session.title} no tiene pasos observados en metadata.`, 'techniques', 'Agregar pasos'));
    }
    if (steps.some((step) => !step.actorStakeholderId && !String(step.actorRole ?? '').trim())) {
      warnings.push(issue('warning', 'TRANSACTION_STEP_WITHOUT_ACTOR', 'Paso sin actor', `${session.title} tiene pasos sin actor responsable.`, 'techniques', 'Completar actor'));
    }
    if (steps.some((step) => String(step.issue ?? '').trim()) && session.finding_count < 1) {
      warnings.push(issue('warning', 'TRANSACTION_ISSUE_WITHOUT_FINDING', 'Problema sin hallazgo', `${session.title} tiene problemas observados pero no hallazgos vinculados.`, 'findings', 'Crear hallazgo'));
    }
  }
  if (input.sessions.length === 0) {
    warnings.push(issue('warning', 'NO_SESSIONS', 'Sin tecnicas', 'No hay entrevistas, observaciones, documentos u otras sesiones de recopilacion.', 'techniques', 'Registrar tecnica'));
  }
  const sessionsWithoutEvidence = input.sessions.filter((session) => session.evidence_count < 1).length;
  if (sessionsWithoutEvidence > 0) {
    warnings.push(issue('warning', 'SESSIONS_WITHOUT_EVIDENCE', 'Tecnicas sin evidencia', `${sessionsWithoutEvidence} sesion(es) no tienen evidencia adjunta.`, 'evidences', 'Completar evidencia'));
  }
  const orphanFindings = input.findings.filter((finding) => !linkedFindingIds.has(finding.id)).length;
  if (orphanFindings > 0) {
    warnings.push(issue('warning', 'FINDINGS_WITHOUT_REQUIREMENT', 'Hallazgos sin requisito', `${orphanFindings} hallazgo(s) aun no fueron convertidos en requisito.`, 'requirements', 'Vincular requisitos'));
  }
  const requirementsWithoutEvidence = input.requirements.length - requirementsWithEvidence.length;
  if (requirementsWithoutEvidence > 0) {
    warnings.push(issue('warning', 'REQUIREMENTS_WITHOUT_EVIDENCE', 'Requisitos sin evidencia', `${requirementsWithoutEvidence} requisito(s) no tienen hallazgos/evidencia fuente.`, 'requirements', 'Vincular hallazgos'));
  }
  const requirementsWithoutUseCase = input.requirements.length - requirementsWithPersistedUseCase.length;
  if (requirementsWithoutUseCase > 0) {
    warnings.push(issue('warning', 'REQUIREMENTS_WITHOUT_USE_CASE', 'Requisitos sin caso persistido', `${requirementsWithoutUseCase} requisito(s) no tienen historia/caso guardado manualmente.`, 'useCases', 'Revisar casos'));
  }
  const useCasesWithoutCriteria = input.useCases.length - useCasesWithCriteria.length;
  if (useCasesWithoutCriteria > 0) {
    warnings.push(issue('warning', 'USE_CASES_WITHOUT_CRITERIA', 'Casos sin criterios claros', `${useCasesWithoutCriteria} caso(s) necesitan criterios de aceptacion mas especificos.`, 'useCases', 'Editar criterios'));
  }
  const requirementsWithoutProcess = input.requirements.length - requirementsWithProcess.length;
  if (requirementsWithoutProcess > 0) {
    warnings.push(issue('warning', 'REQUIREMENTS_WITHOUT_PROCESS', 'Requisitos sin proceso', `${requirementsWithoutProcess} requisito(s) no tienen proceso/sesion trazable.`, 'processes', 'Relacionar proceso'));
  }
  if (input.specs.length === 0 && input.requirements.length > 0) {
    warnings.push(issue('warning', 'NO_SPECS', 'Specs no revisadas', 'Hay requisitos, pero aun no se revisaron specs derivadas.', 'specs', 'Revisar specs'));
  }
  if (diagramCount === 0) {
    warnings.push(issue('warning', 'NO_DIAGRAMS', 'Sin diagramas', 'El paquete no incluye diagramas revisables o derivados.', 'modeling', 'Crear diagrama'));
  }
  if (!stack?.backendFramework || !stack?.frontendFramework || !stack?.backendDatabase || !stack?.backendAuth) {
    warnings.push(issue('warning', 'TARGET_STACK_INCOMPLETE', 'Stack objetivo incompleto', 'Define backend, frontend, base de datos y auth del sistema a implementar.', 'targetStack', 'Completar stack'));
  }
  if (requirementsWithoutContract > 0) {
    warnings.push(issue('warning', 'REQUIREMENTS_WITHOUT_CONTRACT', 'Requisitos sin contrato tecnico', `${requirementsWithoutContract} requisito(s) no tienen endpoint, payload, reglas y pruebas capturadas.`, 'technicalContracts', 'Crear contratos'));
  }
  if (contractsWithoutEndpoint > 0) {
    warnings.push(issue('warning', 'CONTRACTS_WITHOUT_ENDPOINT', 'Contratos sin endpoint', `${contractsWithoutEndpoint} contrato(s) no tienen endpoint sugerido.`, 'technicalContracts', 'Completar endpoints'));
  }
  if (contractsWithoutValidations > 0) {
    warnings.push(issue('warning', 'CONTRACTS_WITHOUT_VALIDATIONS', 'Contratos sin validaciones', `${contractsWithoutValidations} contrato(s) no tienen validaciones.`, 'technicalContracts', 'Agregar validaciones'));
  }
  if (contractsWithoutErrors > 0) {
    warnings.push(issue('warning', 'CONTRACTS_WITHOUT_ERRORS', 'Contratos sin errores esperados', `${contractsWithoutErrors} contrato(s) no documentan errores esperados.`, 'technicalContracts', 'Agregar errores'));
  }
  if (entities.length === 0) {
    warnings.push(issue('warning', 'NO_DATA_MODEL', 'Sin modelo de datos manual', 'No hay entidades, campos, relaciones e integridad capturadas manualmente.', 'dataModel', 'Crear modelo'));
  }
  if (entities.some((entity) => entity.fields.length === 0)) {
    warnings.push(issue('warning', 'ENTITY_WITHOUT_FIELDS', 'Entidad sin campos', 'Hay entidades del modelo sin campos definidos.', 'dataModel', 'Agregar campos'));
  }
  if (roles.length === 0) {
    warnings.push(issue('warning', 'NO_TARGET_ROLES', 'Sin roles objetivo', 'No hay roles/permisos del sistema objetivo.', 'roles', 'Crear roles'));
  }
  if (roles.some((role) => role.permissions.length === 0)) {
    warnings.push(issue('warning', 'ROLE_WITHOUT_PERMISSIONS', 'Rol sin permisos', 'Hay roles sin permisos accionables.', 'roles', 'Agregar permisos'));
  }

  suggestions.push(issue('suggestion', 'MANUAL_REVIEW', 'Revision manual final', 'Antes de entregar, revisa inferencias del modelo de clases y flujos derivados.', 'validation', 'Abrir validacion'));
  if (input.requirements.length > 0) {
    suggestions.push(issue('suggestion', 'EXPORT_READY_CHECK', 'Previsualizar paquete', 'Valida warnings y exporta specs implementables cuando el score sea suficiente.', 'specs', 'Preparar entrega'));
  }

  const checks = [
    Boolean(input.project?.name && (input.project.objective || input.project.description)),
    input.stakeholders.length > 0,
    input.processes.length > 0,
    input.sessions.length > 0,
    input.processes.length === 0 || processesWithoutTransaction === 0,
    transactionSessions.every((session) => session.process_id && transactionSteps(session).length > 0),
    input.sessions.length > 0 && sessionsWithoutEvidence === 0,
    input.findings.length > 0,
    input.findings.length > 0 && orphanFindings === 0,
    input.requirements.length > 0,
    input.requirements.length > 0 && requirementsWithoutEvidence === 0,
    input.requirements.length > 0 && requirementsWithUseCase.length === input.requirements.length,
    input.requirements.length > 0 && requirementsWithPersistedUseCase.length === input.requirements.length,
    input.useCases.length > 0 && useCasesWithoutCriteria === 0,
    input.specs.length > 0,
    diagramCount > 0,
    Boolean(stack?.backendFramework && stack?.frontendFramework && stack?.backendDatabase && stack?.backendAuth),
    input.requirements.length === 0 || requirementsWithoutContract === 0,
    contracts.length === 0 || contractsWithoutEndpoint === 0,
    contracts.length === 0 || contractsWithoutValidations === 0,
    contracts.length === 0 || contractsWithoutErrors === 0,
    entities.length > 0 && entities.every((entity) => entity.fields.length > 0),
    roles.length > 0 && roles.every((role) => role.permissions.length > 0),
    errors.length === 0 && warnings.length <= 2
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return {
    score,
    status: statusForScore(score, errors.length),
    errors,
    warnings,
    suggestions
  };
};
