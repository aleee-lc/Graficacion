import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProcessesService, type Process, type Subprocess } from '../../services/processes.service';
import { ProjectsService, type Project, type ProjectUser } from '../../services/projects.service';
import { UsersService } from '../../services/users.service';
import {
  TraceabilityService,
  type AIDraftFinding,
  type AIDraftRequirement,
  type Evidence,
  type Finding,
  type FlowStatus,
  type Requirement,
  type Session,
  type Stakeholder,
  type SurveyForm,
  type SurveyMetric,
  type SurveyQuestion,
  type SurveyResponse,
  type QuestionnaireCategory,
  type TraceabilityItem,
  type UseCase
} from '../../services/traceability.service';
import {
  cleanProjectFilePart,
  createZipBlob,
  dataUrlToBytes,
  projectFileFromPath,
  readZipEntries,
  removeAccents,
  slugify,
  tryReadBundleFiles
} from './project-file-utils';
import { buildImplementationSpecFiles, type ImplementationSpecFile } from './implementation-spec-export';
import { TECHNIQUE_MODULES, WORKSPACE_MODULES, WORKSPACE_NAVIGATION_GROUPS } from './project-workspace-navigation';
import { buildLocalQuestionnaireSuggestions } from './questionnaire-suggestions';
import { buildRequirementReadiness } from './requirement-readiness';
import type { ReadinessIssue } from './requirement-readiness';
import type {
  CaptureModuleKey,
  AgentProfile,
  AgentProfileKey,
  DerivedAgentTask,
  DerivedDiagram,
  DerivedSpec,
  DerivedUseCase,
  DiagramEdge,
  DiagramEdgeType,
  DiagramEditorMode,
  DiagramKind,
  DiagramModel,
  DiagramNode,
  DiagramNodeType,
  DiagramResizeHandle,
  DomainEntity,
  DataEntitySpec,
  DataFieldSpec,
  DataRelationshipSpec,
  EndpointMethod,
  ExpectedError,
  FieldSpec,
  FieldSpecType,
  ImplementationContract,
  ModuleKey,
  NavigationGroup,
  ProjectArtifactFile,
  ProjectFileDraft,
  SavedDiagramEntry,
  SurveyQuestionDraft,
  TargetRoleSpec,
  TargetStack,
  TraceAuditRow,
  TraceViewKey,
  WorkspaceModule
} from './project-workspace.models';

type DiscoveryType = Session['discovery_type'];
type SessionStatus = Session['status'];
type FindingEditDraft = Pick<Finding, 'category' | 'statement'>;
type RequirementEditDraft = Pick<Requirement, 'type' | 'priority' | 'description' | 'acceptance_criteria'> & {
  finding_ids: number[];
};
type UseCaseEditDraft = {
  requirement_id: number;
  persistedId: number | null;
  title: string;
  actor: string;
  action: string;
  benefit: string;
  acceptance_criteria: string;
};
type DocumentEditorKind = 'finding' | 'requirement' | 'use_case';
type TransactionTrackingStepDraft = {
  name: string;
  actorStakeholderId: number | null;
  actorRole: string;
  system: string;
  channel: string;
  input: string;
  action: string;
  output: string;
  duration: string;
  waitTime: string;
  issue: string;
  bottleneck: string;
  handoffTo: string;
  evidenceRef: string;
  notes: string;
};
type TransactionTrackingStep = Partial<TransactionTrackingStepDraft> & {
  order?: number;
  actorStakeholderId?: number | null;
};
type TransactionTrackingProblem = {
  stepOrder?: number;
  description?: string;
  severity?: string;
  impact?: string | null;
  evidenceRef?: string | null;
};
type TransactionTrackingMetrics = {
  totalTime?: string | null;
  targetTime?: string | null;
  deviation?: string | null;
  reworkCount?: number | null;
  manualStepCount?: number | null;
  informalApprovalCount?: number | null;
  notes?: string | null;
};

const DEFAULT_TARGET_STACK: TargetStack = {
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
  seedAdmin: 'admin@example.com / cambiar password en primer acceso',
  commands: ['backend: uvicorn app.main:app --reload', 'frontend: npm run dev', 'migraciones: alembic upgrade head']
};

const FIELD_TYPES: FieldSpecType[] = ['string', 'number', 'boolean', 'date', 'datetime', 'enum', 'object', 'array'];
const ENDPOINT_METHODS: EndpointMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const AGENT_PROFILES: AgentProfile[] = [
  {
    key: 'gemini',
    label: 'Equipo frontend/backend',
    provider: 'Equipo interno',
    model: 'revision-manual',
    description: 'Perfil manual para devs que implementan desde documentacion trazable.'
  },
  {
    key: 'codex',
    label: 'Equipo fullstack',
    provider: 'Equipo interno',
    model: 'fullstack-manual',
    description: 'Perfil para ingenieros que toman tareas incrementales, pruebas y resumen de cambios.'
  },
  {
    key: 'generic',
    label: 'Equipo tecnico externo',
    provider: 'Proveedor externo',
    model: 'handoff-manual',
    description: 'Perfil neutral para cualquier equipo que reciba archivos locales como contexto.'
  }
];

@Component({
  selector: 'app-project-workspace',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './project-workspace.html',
  styleUrl: './project-workspace.css'
})
export class ProjectWorkspace {
  private readonly fb = inject(FormBuilder);

  readonly modules: WorkspaceModule[] = WORKSPACE_MODULES;
  readonly techniqueModules: Array<WorkspaceModule & { key: CaptureModuleKey; technique: string }> = TECHNIQUE_MODULES;
  readonly navigationGroups: NavigationGroup[] = WORKSPACE_NAVIGATION_GROUPS;
  readonly discoveryGroups: Array<{ type: DiscoveryType; label: string; description: string }> = [
    { type: 'direct', label: 'Directas', description: 'Entrevistas, observacion, focus group y seguimiento transaccional.' },
    { type: 'indirect', label: 'Indirectas', description: 'Revision documental y analisis de fuentes existentes.' },
    { type: 'self_managed', label: 'Autogestionadas', description: 'Cuestionarios y formularios respondidos por stakeholders.' },
    { type: 'synthesis', label: 'Sintesis', description: 'Historias de usuario, story mapping, prototipos y refinamiento tecnico.' }
  ];
  readonly sessionStatuses: Array<{ value: SessionStatus; label: string }> = [
    { value: 'planned', label: 'Planeada' },
    { value: 'in_analysis', label: 'En analisis' },
    { value: 'completed', label: 'Completada' }
  ];

  // I keep UI state separate from loaded data so the template stays predictable.
  readonly projectId = signal<number | null>(null);
  readonly project = signal<Project | null>(null);
  readonly activeModule = signal<ModuleKey>('summary');
  readonly activeTechnique = signal<CaptureModuleKey>('interviews');
  readonly activeTraceView = signal<TraceViewKey>('chain');
  readonly diagram = signal<DiagramModel | null>(null);
  readonly diagramMode = signal<DiagramEditorMode>('select');
  readonly selectedDiagramNodeId = signal<string | null>(null);
  readonly selectedDiagramEdgeId = signal<string | null>(null);
  readonly connectSourceNodeId = signal<string | null>(null);
  readonly exportedDiagramJson = signal<string | null>(null);
  readonly savedDiagrams = signal<SavedDiagramEntry[]>([]);
  readonly selectedSavedDiagramId = signal<string | null>(null);
  readonly managedProjectFiles = signal<ProjectArtifactFile[]>([]);
  readonly deletedGeneratedProjectFileIds = signal<string[]>([]);
  readonly selectedProjectFileId = signal<string | null>(null);
  readonly projectFileDraft = signal<ProjectFileDraft | null>(null);
  readonly targetStack = signal<TargetStack>({ ...DEFAULT_TARGET_STACK });
  readonly implementationContracts = signal<ImplementationContract[]>([]);
  readonly dataEntities = signal<DataEntitySpec[]>([]);
  readonly targetRoles = signal<TargetRoleSpec[]>([]);
  readonly diagramZoom = signal(1.0);
  readonly diagramPanX = signal(0);
  readonly diagramPanY = signal(0);
  readonly diagramContentTransform = computed(() =>
    `translate(${this.diagramPanX()},${this.diagramPanY()}) scale(${this.diagramZoom()})`
  );

  private isPanning = false;
  private lastPanClient = { x: 0, y: 0 };

  readonly draggingNode = signal<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  readonly resizingNode = signal<{
    nodeId: string;
    handle: DiagramResizeHandle;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);
  readonly selectedInterviewFiles = signal<File[]>([]);
  readonly selectedDocumentFiles = signal<File[]>([]);
  readonly darkMode = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  // Backend state. Most of the workspace is derived from these collections.
  readonly stakeholders = signal<Stakeholder[]>([]);
  readonly techUsers = signal<ProjectUser[]>([]);
  readonly clientUsers = signal<ProjectUser[]>([]);
  readonly techSearchQuery = signal('');
  readonly techSearchResults = signal<ProjectUser[]>([]);
  readonly processes = signal<Process[]>([]);
  readonly subprocesses = signal<Subprocess[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly evidencesBySession = signal<Record<number, Evidence[]>>({});
  readonly findings = signal<Finding[]>([]);
  readonly requirements = signal<Requirement[]>([]);
  readonly useCases = signal<UseCase[]>([]);
  readonly traceability = signal<TraceabilityItem[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly aiDraftFindings = signal<AIDraftFinding[]>([]);
  readonly aiDraftRequirements = signal<AIDraftRequirement[]>([]);
  readonly surveys = signal<SurveyForm[]>([]);
  readonly selectedSurveyId = signal<number | null>(null);
  readonly selectedSurveyQuestions = signal<SurveyQuestion[]>([]);
  readonly selectedSurveyRecipients = signal<Array<{ id: number; name: string; role: string }>>([]);
  readonly surveyResponses = signal<SurveyResponse[]>([]);
  readonly surveyMetrics = signal<SurveyMetric[]>([]);
  readonly selectedSurveyStakeholderIds = signal<number[]>([]);
  readonly surveyAIPrompt = signal('');
  readonly transactionSteps = signal<TransactionTrackingStepDraft[]>([
    {
      name: '',
      actorStakeholderId: null,
      actorRole: '',
      system: '',
      channel: '',
      input: '',
      action: '',
      output: '',
      duration: '',
      waitTime: '',
      issue: '',
      bottleneck: '',
      handoffTo: '',
      evidenceRef: '',
      notes: ''
    }
  ]);
  readonly surveyQuestionsDraft = signal<SurveyQuestionDraft[]>([
    { question_text: '', question_type: 'long_text', required: true, optionsText: '', help_text: '' }
  ]);
  readonly editingFindingId = signal<number | null>(null);
  readonly findingEditDraft = signal<FindingEditDraft | null>(null);
  readonly editingRequirementId = signal<number | null>(null);
  readonly requirementEditDraft = signal<RequirementEditDraft | null>(null);
  readonly editingUseCaseId = signal<string | null>(null);
  readonly useCaseEditDraft = signal<UseCaseEditDraft | null>(null);
  readonly agentProfiles = AGENT_PROFILES;
  readonly selectedAgentProfile = signal<AgentProfileKey>('gemini');
  readonly aiHandoffPromptVersion = 'agent-handoff-v2';
  readonly activeAgentProfile = computed(
    () => this.agentProfiles.find((profile) => profile.key === this.selectedAgentProfile()) ?? this.agentProfiles[0]
  );
  readonly fieldTypes = FIELD_TYPES;
  readonly endpointMethods = ENDPOINT_METHODS;

  // Forms are intentionally close to the page because each one maps to a visible workspace panel.
  readonly stakeholderForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    role: ['', [Validators.required, Validators.minLength(2)]],
    type: ['external' as 'internal' | 'external', [Validators.required]],
    contact: ['']
  });

  readonly projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    objective: ['', [Validators.required, Validators.minLength(8)]],
    scope: [''],
    description: [''],
    start_date: [''],
    end_date: ['']
  });

  readonly processForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', [Validators.required, Validators.minLength(8)]]
  });

  readonly subprocessForm = this.fb.group({
    process_id: [null as number | null, [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['']
  });

  readonly interviewForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    objective: [''],
    scheduled_at: [''],
    duration: [''],
    interviewer_user_id: [null as number | null, [Validators.required]],
    interviewed_stakeholder_id: [null as number | null],
    questions: ['', [Validators.required, Validators.minLength(12)]],
    transcript: [''],
    agreements: [''],
    pains: [''],
    needs: [''],
    notes: ['']
  });

  readonly surveyForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(8)]],
    objective: [''],
    category: ['survey' as QuestionnaireCategory],
    allow_audio: [false],
    allow_document: [false],
    allow_anonymous_response: [true],
    due_at: [''],
    participants: [0, [Validators.min(0)]],
    status: ['draft' as 'draft' | 'active' | 'closed'],
    question: ['']
  });

  readonly observationForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    processName: [''],
    place: [''],
    observedActor: [''],
    observedAt: [''],
    context: [''],
    behavior: [''],
    problem: [''],
    impact: [''],
    note: ['', [Validators.required, Validators.minLength(20)]],
    keyPoint: ['']
  });

  readonly focusForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    moderator: ['', [Validators.required, Validators.minLength(2)]],
    mediaType: [''],
    objective: ['', [Validators.required, Validators.minLength(12)]],
    participants: [''],
    guideQuestions: [''],
    agreements: [''],
    disagreements: [''],
    detectedNeeds: [''],
    conclusions: ['']
  });

  readonly documentForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    documentType: ['', [Validators.required, Validators.minLength(2)]],
    source: ['', [Validators.required, Validators.minLength(2)]],
    documentName: ['', [Validators.required, Validators.minLength(3)]],
    version: [''],
    documentDate: [''],
    author: [''],
    summary: [''],
    businessRules: [''],
    explicitRequirements: [''],
    risks: [''],
    documentContent: [''],
    findings: ['']
  });

  readonly trackingForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    process_id: [null as number | null, [Validators.required]],
    subprocess_id: [null as number | null],
    transactionId: ['', [Validators.required, Validators.minLength(3)]],
    transactionType: [''],
    startedAt: [''],
    completedAt: [''],
    finalStatus: [''],
    primaryActorId: [null as number | null],
    systemsInvolved: [''],
    objective: [''],
    realFlowSummary: [''],
    totalTime: [''],
    targetTime: [''],
    deviation: [''],
    reworkCount: [0],
    manualStepCount: [0],
    informalApprovalCount: [0],
    status: [''],
    metrics: ['']
  });

  readonly findingForm = this.fb.group({
    session_id: [null as number | null, [Validators.required]],
    category: ['need' as 'problem' | 'need' | 'constraint', [Validators.required]],
    statement: ['', [Validators.required, Validators.minLength(20)]]
  });

  readonly requirementForm = this.fb.group({
    type: ['functional' as 'functional' | 'non_functional', [Validators.required]],
    priority: ['medium' as 'low' | 'medium' | 'high' | 'critical', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(12)]],
    acceptance_criteria: ['', [Validators.required, Validators.minLength(12)]],
    finding_ids: this.fb.control<number[]>([], [Validators.required])
  });

  readonly targetStackForm = this.fb.group({
    architectureType: [DEFAULT_TARGET_STACK.architectureType, [Validators.required]],
    backendFramework: [DEFAULT_TARGET_STACK.backendFramework, [Validators.required]],
    backendLanguage: [DEFAULT_TARGET_STACK.backendLanguage, [Validators.required]],
    backendOrm: [DEFAULT_TARGET_STACK.backendOrm],
    backendDatabase: [DEFAULT_TARGET_STACK.backendDatabase, [Validators.required]],
    backendMigrations: [DEFAULT_TARGET_STACK.backendMigrations],
    backendAuth: [DEFAULT_TARGET_STACK.backendAuth],
    backendTesting: [DEFAULT_TARGET_STACK.backendTesting],
    frontendFramework: [DEFAULT_TARGET_STACK.frontendFramework, [Validators.required]],
    frontendLanguage: [DEFAULT_TARGET_STACK.frontendLanguage, [Validators.required]],
    frontendUi: [DEFAULT_TARGET_STACK.frontendUi],
    frontendRouting: [DEFAULT_TARGET_STACK.frontendRouting],
    frontendDataFetching: [DEFAULT_TARGET_STACK.frontendDataFetching],
    frontendState: [DEFAULT_TARGET_STACK.frontendState],
    frontendTesting: [DEFAULT_TARGET_STACK.frontendTesting],
    runMode: [DEFAULT_TARGET_STACK.runMode],
    envVars: [DEFAULT_TARGET_STACK.envVars.join('\n')],
    seedAdmin: [DEFAULT_TARGET_STACK.seedAdmin],
    commands: [DEFAULT_TARGET_STACK.commands.join('\n')]
  });

  readonly contractForm = this.fb.group({
    requirementId: [null as number | null, [Validators.required]],
    screenName: [''],
    routePath: [''],
    endpointMethod: ['POST' as EndpointMethod],
    endpointPath: [''],
    requestFieldsText: [''],
    responseFieldsText: [''],
    businessRulesText: [''],
    blockingRulesText: [''],
    stateRulesText: [''],
    requiredVisibleDataText: [''],
    validationsText: [''],
    expectedErrorsText: [''],
    permissionsText: [''],
    acceptanceChecksText: [''],
    testCasesText: [''],
    screenFieldsText: [''],
    visibleColumnsText: [''],
    quickActionsText: [''],
    filtersText: [''],
    sideEffectsText: [''],
    uiErrorBehaviorText: ['']
  });

  readonly dataEntityForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    tableName: [''],
    description: [''],
    source: ['manual' as DataEntitySpec['source']],
    confidence: ['alta' as DataEntitySpec['confidence']],
    fieldsText: [''],
    relationshipsText: [''],
    integrityRulesText: ['']
  });

  readonly targetRoleForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    userType: [''],
    permissionsText: [''],
    screensText: [''],
    endpointsText: ['']
  });

  readonly captureModules = computed(() => this.techniqueModules);

  readonly techMembers = computed(() => this.techUsers());

  // Derived dashboard state. This is where I turn traceability data into things the UI can scan quickly.
  readonly activeModuleInfo = computed(
    () => this.modules.find((item) => item.key === this.activeModule()) ?? this.modules[0]
  );

  readonly evidenceCount = computed(() =>
    this.sessions().reduce((total, session) => total + session.evidence_count, 0)
  );

  readonly traceabilityHealth = computed(() => {
    const total = this.requirements().length;
    if (total === 0) {
      return 0;
    }
    const linked = this.traceability().filter((item) => item.links.length > 0).length;
    return Math.round((linked / total) * 100);
  });

  readonly requirementReadiness = computed(() =>
    buildRequirementReadiness({
      project: this.project(),
      stakeholders: this.stakeholders(),
      processes: this.processes(),
      sessions: this.sessions(),
      findings: this.findings(),
      requirements: this.requirements(),
      useCases: this.useCaseArtifacts(),
      specs: this.specArtifacts(),
      diagrams: this.diagramArtifacts(),
      savedDiagrams: this.savedDiagrams(),
      targetStack: this.targetStack(),
      implementationContracts: this.implementationContracts(),
      dataEntities: this.dataEntities(),
      targetRoles: this.targetRoles()
    })
  );

  readonly implementationSpecPreviewFiles = computed<ImplementationSpecFile[]>(() =>
    buildImplementationSpecFiles({
      project: this.project(),
      projectId: this.projectId(),
      stakeholders: this.stakeholders(),
      processes: this.processes(),
      sessions: this.sessions(),
      findings: this.findings(),
      requirements: this.requirements(),
      useCases: this.useCaseArtifacts(),
      diagrams: this.diagramArtifacts(),
      savedDiagrams: this.savedDiagrams(),
      targetStack: this.targetStack(),
      implementationContracts: this.implementationContracts(),
      dataEntities: this.dataEntities(),
      targetRoles: this.targetRoles(),
      designInputs: this.designInputFiles(),
      readiness: this.requirementReadiness()
    })
  );

  readonly architectureSpecPreview = computed(() =>
    this.implementationSpecPreviewFiles().find((file) => file.path === '04_ARCHITECTURE.md')?.content ?? ''
  );

  readonly designSpecPreview = computed(() =>
    this.implementationSpecPreviewFiles().find((file) => file.path === '07_DESIGN.md')?.content ?? ''
  );

  readonly readinessIssues = computed(() => {
    const readiness = this.requirementReadiness();
    return [...readiness.errors, ...readiness.warnings, ...readiness.suggestions];
  });

  readonly trackingSubprocessOptions = computed(() => {
    const processId = this.trackingForm.get('process_id')?.value;
    return processId ? this.subprocesses().filter((subprocess) => subprocess.process_id === processId) : [];
  });

  readonly orphanFindingsCount = computed(() =>
    this.findings().filter((finding) =>
      !this.requirements().some((requirement) => requirement.finding_ids?.includes(finding.id))
    ).length
  );

  readonly pendingAIDraftCount = computed(
    () =>
      this.aiDraftFindings().filter((draft) => draft.status === 'pending').length +
      this.aiDraftRequirements().filter((draft) => draft.status === 'pending').length
  );

  readonly techniquesWithoutEvidenceCount = computed(
    () => this.sessions().filter((session) => session.evidence_count < 1).length
  );

  readonly incompleteRequirementsCount = computed(
    () => this.requirements().filter((requirement) => !this.traceability().some((item) => item.id === requirement.id && item.links.length > 0)).length
  );

  // These artifacts are generated on the fly so they can be reviewed before anything is handed to an agent.
  readonly useCaseArtifacts = computed<DerivedUseCase[]>(() =>
    this.requirements().map((requirement) => {
      const sourceFindings = this.requirementSourceFindings(requirement);
      const persisted = this.useCases().find((useCase) => useCase.requirement_id === requirement.id);
      const actor = sourceFindings[0]?.session_technique === 'Entrevista'
        ? 'stakeholder participante'
        : 'usuario del proceso';
      return {
        id: persisted ? `uc-persisted-${persisted.id}` : `uc-derived-${requirement.id}`,
        persistedId: persisted?.id ?? null,
        title: persisted?.title ?? `${requirement.code} - Caso de uso derivado`,
        requirement,
        actor: persisted?.actor ?? actor,
        action: persisted?.action ?? this.summarizeRequirementAction(requirement.description),
        benefit: persisted?.benefit ?? 'mantener el requisito trazable, verificable y listo para implementacion',
        acceptanceCriteria: persisted?.acceptance_criteria ?? requirement.acceptance_criteria,
        sourceFindings
      };
    })
  );

  readonly activeDocumentEditor = computed<DocumentEditorKind | null>(() => {
    if (this.editingFindingId()) {
      return 'finding';
    }
    if (this.editingRequirementId()) {
      return 'requirement';
    }
    if (this.editingUseCaseId()) {
      return 'use_case';
    }
    return null;
  });

  readonly activeEditingFinding = computed(() => {
    const id = this.editingFindingId();
    return id ? this.findings().find((finding) => finding.id === id) ?? null : null;
  });

  readonly activeEditingRequirement = computed(() => {
    const id = this.editingRequirementId();
    return id ? this.requirements().find((requirement) => requirement.id === id) ?? null : null;
  });

  readonly activeEditingUseCase = computed(() => {
    const id = this.editingUseCaseId();
    return id ? this.useCaseArtifacts().find((useCase) => useCase.id === id) ?? null : null;
  });

  readonly specArtifacts = computed<DerivedSpec[]>(() =>
    this.useCaseArtifacts().map((useCase) => {
      const endpoints = this.suggestEndpoints(useCase.requirement);
      const tests = this.suggestTests(useCase.requirement);
      return {
        id: `spec-${useCase.requirement.id}`,
        title: `Spec ${useCase.requirement.code}`,
        useCase,
        endpoints,
        tests,
        markdown: [
          `# ${useCase.title}`,
          '',
          `## Objetivo`,
          useCase.requirement.description,
          '',
          `## Requisito fuente`,
          `${useCase.requirement.code} (${useCase.requirement.type}, ${useCase.requirement.priority})`,
          '',
          `## Historia`,
          `Como ${useCase.actor}, quiero ${useCase.action}, para ${useCase.benefit}.`,
          '',
          `## Criterios de aceptacion`,
          useCase.acceptanceCriteria,
          '',
          `## Endpoints sugeridos`,
          endpoints.map((endpoint) => `- ${endpoint}`).join('\n'),
          '',
          `## Pruebas esperadas`,
          tests.map((test) => `- ${test}`).join('\n')
        ].join('\n')
      };
    })
  );

  readonly designInputFiles = computed(() => this.managedProjectFiles().filter((file) => this.isDesignInputFile(file)));

  readonly aiSpecHandoffPackage = computed(() => ({
    format: 'specora-agent-handoff-v2',
    agent_profile: this.activeAgentProfile().key,
    model: this.activeAgentProfile().model,
    provider: this.activeAgentProfile().provider,
    prompt_version: this.aiHandoffPromptVersion,
    offline_only: true,
    language: 'es-MX',
    generated_at: new Date().toISOString(),
    project: {
      id: this.projectId(),
      name: this.project()?.name ?? 'Proyecto',
      objective: this.project()?.objective ?? '',
      scope: this.project()?.scope ?? '',
      description: this.project()?.description ?? ''
    },
    instructions_file: '00_AGENT_INSTRUCTIONS.md',
    instructions: this.agentInstructions(),
    specs: this.specArtifacts().map((spec) => ({
      spec_id: spec.id,
      title: spec.title,
      requirement_code: spec.useCase.requirement.code,
      requirement_id: spec.useCase.requirement.id,
      use_case_id: spec.useCase.persistedId,
      requirement_type: spec.useCase.requirement.type,
      priority: spec.useCase.requirement.priority,
      objective: spec.useCase.requirement.description,
      user_story: {
        actor: spec.useCase.actor,
        action: spec.useCase.action,
        benefit: spec.useCase.benefit
      },
      acceptance_criteria: spec.useCase.acceptanceCriteria,
      endpoints: spec.endpoints,
      tests: spec.tests,
      source_findings: spec.useCase.sourceFindings.map((finding) => ({
        id: finding.id,
        category: finding.category,
        statement: finding.statement,
        session_id: finding.session_id,
        session_technique: finding.session_technique
      })),
      markdown: spec.markdown
    })),
    design_inputs: this.designInputFiles().map((file) => ({
      path: this.projectFilePath(file),
      kind: file.kind,
      mime_type: file.mime_type ?? 'text/plain',
      size_bytes: file.size_bytes ?? file.content.length,
      encoding: file.encoding,
      included_as_file: true
    })),
    diagrams: [
      ...this.diagramArtifacts().map((diagram) => ({
        id: diagram.id,
        title: diagram.title,
        kind: diagram.kind,
        source: diagram.source,
        sourceRequirementIds: diagram.sourceRequirementIds,
        sourceUseCaseIds: diagram.sourceUseCaseIds,
        sourceSpecIds: diagram.sourceSpecIds,
        format: 'drawio-lite-json',
        content: diagram.diagram
      })),
      ...this.savedDiagrams().map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: entry.type,
        source: 'saved-diagram',
        sourceRequirementIds: entry.diagram.sourceRequirementIds,
        sourceUseCaseIds: entry.diagram.sourceUseCaseIds,
        sourceSpecIds: entry.diagram.sourceSpecIds,
        format: 'drawio-lite-json',
        content: entry.diagram
      }))
    ],
    traceability_matrix: this.traceabilityMatrixForHandoff()
  }));

  readonly traceabilityMatrixForHandoff = computed(() =>
    this.traceAuditRows().map((row) => ({
      stakeholder: row.stakeholder,
      session_technique: row.technique,
      evidence: row.evidence,
      finding: row.finding,
      requirement_id: row.requirement.id,
      requirement_code: row.requirement.code,
      user_story_or_use_case_id: row.useCase?.persistedId ?? row.useCase?.id ?? null,
      spec_id: row.spec?.id ?? null,
      diagram_id: row.diagram?.id ?? null,
      design_input_paths: this.designInputFiles().map((file) => this.projectFilePath(file)),
      agent_task_id: row.task?.id ?? null,
      status: row.status
    }))
  );

  readonly diagramArtifacts = computed<DerivedDiagram[]>(() => this.buildDerivedDiagramArtifacts());

  // The project folder is a virtual bundle: generated artifacts plus whatever I edit or import manually.
  readonly generatedProjectArtifactFiles = computed<ProjectArtifactFile[]>(() => {
    const files: ProjectArtifactFile[] = [];
    const project = this.project();
    const projectSlug = slugify(project?.name ?? `proyecto-${this.projectId() ?? 'nuevo'}`);

    files.push({
      id: 'specora-manifest',
      folder: '',
      name: 'SPECORA_MANIFEST.json',
      kind: 'Manifest',
      source: 'generated',
      encoding: 'text',
      content: JSON.stringify(
        {
          format: 'specora-project-folder-v2',
          exported_at: new Date().toISOString(),
          agent_profile: this.activeAgentProfile(),
          offline_only: true,
          project_id: this.projectId(),
          project_name: project?.name ?? 'Proyecto',
          file_structure: [
            '00_IMPLEMENTATION_INSTRUCTIONS.md',
            '01_PROJECT_BRIEF.md',
            '02_REQUIREMENTS.md',
            '03_USER_STORIES.md',
            '04_USE_CASES.md',
            '05_ACCEPTANCE_CRITERIA.md',
            '06_DIAGRAMS/',
            '07_DESIGN_IDEAS/',
            '08_TRACEABILITY_MATRIX.json',
            '09_BUILD_PLAN.md'
          ]
        },
        null,
        2
      )
    });

    files.push({
      id: 'agent-instructions',
      folder: '',
      name: '00_IMPLEMENTATION_INSTRUCTIONS.md',
      kind: 'Instrucciones implementacion',
      source: 'generated',
      encoding: 'text',
      content: this.agentInstructionsMarkdown()
    });

    files.push({
      id: 'project-brief',
      folder: '',
      name: '01_PROJECT_BRIEF.md',
      kind: 'Brief',
      source: 'generated',
      encoding: 'text',
      content: this.projectBriefMarkdown()
    });

    files.push({
      id: 'requirements-doc',
      folder: '',
      name: '02_REQUIREMENTS.md',
      kind: 'Requisitos',
      source: 'generated',
      encoding: 'text',
      content: this.requirementsMarkdown()
    });

    files.push({
      id: 'user-stories-doc',
      folder: '',
      name: '03_USER_STORIES.md',
      kind: 'Historias',
      source: 'generated',
      encoding: 'text',
      content: this.userStoriesMarkdown()
    });

    files.push({
      id: 'use-cases-doc',
      folder: '',
      name: '04_USE_CASES.md',
      kind: 'Casos de uso',
      source: 'generated',
      encoding: 'text',
      content: this.useCasesMarkdown()
    });

    files.push({
      id: 'acceptance-criteria-doc',
      folder: '',
      name: '05_ACCEPTANCE_CRITERIA.md',
      kind: 'Criterios',
      source: 'generated',
      encoding: 'text',
      content: this.acceptanceCriteriaMarkdown()
    });

    files.push({
      id: 'traceability-matrix',
      folder: '',
      name: '08_TRACEABILITY_MATRIX.json',
      kind: 'Trazabilidad',
      source: 'generated',
      encoding: 'text',
      content: JSON.stringify(this.traceabilityMatrixForHandoff(), null, 2)
    });

    files.push({
      id: 'build-plan',
      folder: '',
      name: '09_BUILD_PLAN.md',
      kind: 'Plan build',
      source: 'generated',
      encoding: 'text',
      content: this.buildPlanMarkdown()
    });

    files.push({
      id: 'project-context',
      folder: '01_PROJECT_BRIEF_data',
      name: `${projectSlug}-contexto.json`,
      kind: 'Contexto',
      source: 'generated',
      encoding: 'text',
      content: JSON.stringify(
        {
          project,
          stakeholders: this.stakeholders(),
          processes: this.processes(),
          requirements: this.requirements(),
          use_cases: this.useCases(),
          flow_status: this.flowStatus()
        },
        null,
        2
      )
    });

    this.specArtifacts().forEach((spec) => {
      files.push({
        id: `spec-${spec.id}`,
        folder: '02_REQUIREMENTS/specs',
        name: `${slugify(spec.title)}.md`,
        kind: 'Spec',
        source: 'generated',
        encoding: 'text',
        content: spec.markdown
      });
    });

    files.push({
      id: 'implementation-handoff',
      folder: '',
      name: 'paquete-implementacion.json',
      kind: 'Handoff tecnico',
      source: 'generated',
      encoding: 'text',
      content: JSON.stringify(this.aiSpecHandoffPackage(), null, 2)
    });

    this.agentTasks().forEach((task) => {
      files.push({
        id: `agent-${task.id}`,
        folder: '09_BUILD_PLAN/tasks',
        name: `${slugify(task.title)}.txt`,
        kind: 'Tarea tecnica',
        source: 'generated',
        encoding: 'text',
        content: task.prompt
      });
    });

    this.diagramArtifacts().forEach((diagram) => {
      files.push({
        id: `derived-${diagram.id}`,
        folder: '06_DIAGRAMS/derived',
        name: `${slugify(diagram.title)}.drawio-lite.json`,
        kind: 'Derived diagram model',
        source: 'generated',
        encoding: 'text',
        content: JSON.stringify(diagram.diagram, null, 2)
      });
      files.push({
        id: `derived-drawio-${diagram.id}`,
        folder: '06_DIAGRAMS/drawio',
        name: `${slugify(diagram.title)}.drawio`,
        kind: 'Diagrams.net',
        source: 'generated',
        encoding: 'text',
        content: this.buildDrawioXml(diagram.diagram)
      });
    });

    this.savedDiagrams().forEach((entry) => {
      files.push({
        id: `draw-${entry.id}`,
        folder: '06_DIAGRAMS/editables',
        name: `${slugify(entry.title)}.drawio-lite.json`,
        kind: 'Draw.io lite',
        source: 'generated',
        encoding: 'text',
        content: JSON.stringify(entry.diagram, null, 2)
      });
      files.push({
        id: `drawio-${entry.id}`,
        folder: '06_DIAGRAMS/drawio',
        name: `${slugify(entry.title)}.drawio`,
        kind: 'Diagrams.net',
        source: 'generated',
        encoding: 'text',
        content: this.buildDrawioXml(entry.diagram)
      });
    });

    return files;
  });

  readonly projectArtifactFiles = computed<ProjectArtifactFile[]>(() => {
    const deleted = new Set(this.deletedGeneratedProjectFileIds());
    const managed = this.managedProjectFiles();
    const managedById = new Map(managed.map((file) => [file.id, file]));
    const generated = this.generatedProjectArtifactFiles()
      .filter((file) => !deleted.has(file.id))
      .map((file) => managedById.get(file.id) ?? file);
    const custom = managed.filter((file) => !this.generatedProjectArtifactFiles().some((generatedFile) => generatedFile.id === file.id));
    return [...generated, ...custom].sort((a, b) => `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`));
  });

  readonly selectedProjectFile = computed(() => {
    const fileId = this.selectedProjectFileId();
    return this.projectArtifactFiles().find((file) => file.id === fileId) ?? this.projectArtifactFiles()[0] ?? null;
  });

  readonly agentTasks = computed<DerivedAgentTask[]>(() =>
    this.specArtifacts().map((spec) => ({
      id: `task-${spec.useCase.requirement.id}`,
      title: `Implementar ${spec.useCase.requirement.code}`,
      spec,
      files: ['frontend: componente/vista relacionada', 'backend: ruta/servicio si aplica', 'tests: pruebas de aceptacion'],
      prompt: [
        'Perfil de implementacion',
        `${this.activeAgentProfile().provider}: ${this.activeAgentProfile().label}`,
        `Formato de entrega: ${this.aiHandoffPromptVersion}`,
        '',
        'Contexto',
        `Proyecto: ${this.project()?.name ?? 'Proyecto'}`,
        `Spec fuente: ${spec.title}`,
        `Requisito fuente: ${spec.useCase.requirement.code}`,
        '',
        'Objetivo',
        spec.useCase.requirement.description,
        '',
        'Reglas de negocio y criterios',
        spec.useCase.acceptanceCriteria,
        '',
        'Endpoints sugeridos',
        spec.endpoints.join('\n'),
        '',
        'Tests esperados',
        spec.tests.join('\n'),
        '',
        'Diagramas relacionados',
        this.diagramArtifacts()
          .filter((diagram) => diagram.sourceRequirementIds.includes(spec.useCase.requirement.id))
          .map((diagram) => `- ${diagram.title}: ${diagram.id}`)
          .join('\n') || '- Sin diagrama relacionado',
        '',
        'Entradas de diseno disponibles',
        this.designInputFiles().map((file) => `- ${this.projectFilePath(file)}`).join('\n') || '- Sin entradas de diseno',
        '',
        'Restricciones',
        ...this.agentInstructions()
      ].join('\n')
    }))
  );

  readonly selectedDiagramNode = computed(() => {
    const nodeId = this.selectedDiagramNodeId();
    return this.diagram()?.nodes.find((node) => node.id === nodeId) ?? null;
  });

  readonly selectedDiagramEdge = computed(() => {
    const edgeId = this.selectedDiagramEdgeId();
    return this.diagram()?.edges.find((edge) => edge.id === edgeId) ?? null;
  });

  setAgentProfile(profile: AgentProfileKey) {
    this.selectedAgentProfile.set(profile);
    this.success.set(`Perfil de implementacion actualizado a ${this.activeAgentProfile().label}.`);
  }

  agentInstructions() {
    return [
      'Usa solamente los archivos incluidos en este paquete Specora como contexto de producto.',
      'No uses internet para aclarar requisitos, reglas de negocio, diseno o arquitectura.',
      'No inventes reglas de negocio; si falta informacion, crea ASSUMPTIONS.md antes de implementar.',
      'Cada cambio implementado debe mapearse a requirement_id, requirement_code, spec_id, historia/caso y diagrama cuando aplique.',
      'Implementa en incrementos verificables y conserva comportamiento existente que no este contradicho por las specs.',
      'Al terminar, devuelve archivos modificados, pruebas ejecutadas, supuestos y riesgos abiertos.'
    ];
  }

  agentInstructionsMarkdown() {
    const profile = this.activeAgentProfile();
    return [
      '# Instrucciones para equipo de desarrollo',
      '',
      `Perfil seleccionado: ${profile.label}`,
      `Responsable sugerido: ${profile.provider}`,
      `Modo de trabajo: ${profile.model}`,
      '',
      '## Reglas obligatorias',
      this.agentInstructions().map((item) => `- ${item}`).join('\n'),
      '',
      '## Orden de lectura',
      '- 01_PROJECT_BRIEF.md',
      '- 02_REQUIREMENTS.md',
      '- 03_USER_STORIES.md',
      '- 04_USE_CASES.md',
      '- 05_ACCEPTANCE_CRITERIA.md',
      '- 06_DIAGRAMS/',
      '- 07_DESIGN_IDEAS/',
      '- 08_TRACEABILITY_MATRIX.json',
      '- 09_BUILD_PLAN.md',
      '',
      '## Entrega esperada',
      '- Codigo implementado segun specs.',
      '- Pruebas o pasos de verificacion por requisito.',
      '- ASSUMPTIONS.md si hubo ambiguedades.',
      '- Resumen con trazabilidad a IDs de Specora.'
    ].join('\n');
  }

  projectBriefMarkdown() {
    const project = this.project();
    return [
      `# ${project?.name ?? 'Proyecto'}`,
      '',
      '## Objetivo',
      project?.objective || 'Pendiente',
      '',
      '## Alcance',
      project?.scope || 'Pendiente',
      '',
      '## Descripcion',
      project?.description || 'Pendiente',
      '',
      '## Stakeholders',
      this.stakeholders().map((item) => `- ${item.name} (${item.role}, ${item.type})`).join('\n') || '- Pendiente',
      '',
      '## Procesos',
      this.processes().map((item) => `- ${item.name}: ${item.description ?? 'Sin descripcion'}`).join('\n') || '- Pendiente'
    ].join('\n');
  }

  requirementsMarkdown() {
    return [
      '# Requisitos',
      '',
      ...this.requirements().map((requirement) =>
        [
          `## ${requirement.code}`,
          `- Tipo: ${requirement.type}`,
          `- Prioridad: ${requirement.priority}`,
          `- Hallazgos fuente: ${(requirement.finding_ids ?? []).join(', ') || 'Pendiente'}`,
          '',
          requirement.description
        ].join('\n')
      )
    ].join('\n\n');
  }

  userStoriesMarkdown() {
    return [
      '# Historias de usuario',
      '',
      ...this.useCaseArtifacts().map((useCase) =>
        [
          `## ${useCase.title}`,
          `- Requisito: ${useCase.requirement.code}`,
          `- Use case ID: ${useCase.persistedId ?? useCase.id}`,
          '',
          `Como ${useCase.actor}, quiero ${useCase.action}, para ${useCase.benefit}.`
        ].join('\n')
      )
    ].join('\n\n');
  }

  useCasesMarkdown() {
    return [
      '# Casos de uso',
      '',
      ...this.useCaseArtifacts().map((useCase) =>
        [
          `## ${useCase.title}`,
          `- Requisito: ${useCase.requirement.code}`,
          `- Actor: ${useCase.actor}`,
          `- Accion: ${useCase.action}`,
          `- Beneficio: ${useCase.benefit}`,
          '',
          '### Criterios',
          useCase.acceptanceCriteria
        ].join('\n')
      )
    ].join('\n\n');
  }

  acceptanceCriteriaMarkdown() {
    return [
      '# Criterios de aceptacion',
      '',
      ...this.specArtifacts().map((spec) =>
        [`## ${spec.useCase.requirement.code}`, spec.useCase.acceptanceCriteria].join('\n\n')
      )
    ].join('\n\n');
  }

  buildPlanMarkdown() {
    return [
      '# Plan de construccion sugerido',
      '',
      ...this.agentTasks().map((task, index) =>
        [
          `## ${index + 1}. ${task.title}`,
          `- Spec: ${task.spec.id}`,
          `- Requisito: ${task.spec.useCase.requirement.code}`,
          `- Perfil de implementacion: ${this.activeAgentProfile().label}`,
          '',
          '### Verificacion esperada',
          task.spec.tests.map((test) => `- ${test}`).join('\n')
        ].join('\n')
      )
    ].join('\n\n');
  }

  readonly selectedDiagramNodePosition = computed(() => {
    const node = this.selectedDiagramNode();
    return node
      ? {
          x: Math.round(node.x),
          y: Math.round(node.y),
          width: Math.round(node.width),
          height: Math.round(node.height)
        }
      : null;
  });

  // This audit table is the quickest way to see where evidence stops becoming requirements.
  readonly traceAuditRows = computed<TraceAuditRow[]>(() => {
    const rows: TraceAuditRow[] = [];
    const useCases = this.useCaseArtifacts();
    const specs = this.specArtifacts();
    const diagrams = this.diagramArtifacts();
    const tasks = this.agentTasks();
    const linkedRequirementIds = new Set<number>();

    for (const item of this.traceability()) {
      linkedRequirementIds.add(item.id);
      const useCase = useCases.find((artifact) => artifact.requirement.id === item.id) ?? null;
      const spec = specs.find((artifact) => artifact.useCase.requirement.id === item.id) ?? null;
      const diagram = diagrams.find((artifact) => artifact.source === item.code) ?? null;
      const task = tasks.find((artifact) => artifact.spec.useCase.requirement.id === item.id) ?? null;

      if (item.links.length === 0) {
        rows.push({
          id: `trace-${item.id}-empty`,
          stakeholder: 'Stakeholder pendiente',
          technique: 'Tecnica pendiente',
          evidence: 'Sin evidencia',
          finding: 'Sin hallazgo',
          requirement: item,
          useCase,
          spec,
          diagram,
          task,
          status: 'missing-evidence',
          statusLabel: 'Falta evidencia',
          source: 'backend'
        });
        continue;
      }

      for (const link of item.links) {
        const evidenceLabel = link.evidences.length > 0
          ? `${link.evidences.length} evidencia(s)`
          : 'Sin evidencia';
        const status = this.traceStatus(evidenceLabel, useCase, spec, task);
        rows.push({
          id: `trace-${item.id}-${link.finding.id}`,
          stakeholder: link.stakeholders[0]?.name || 'Stakeholder pendiente',
          technique: `${link.session.technique}: ${link.session.title}`,
          evidence: evidenceLabel,
          finding: link.finding.statement,
          requirement: item,
          useCase,
          spec,
          diagram,
          task,
          status: status.status,
          statusLabel: status.label,
          source: 'backend'
        });
      }
    }

    for (const requirement of this.requirements().filter((item) => !linkedRequirementIds.has(item.id))) {
      const useCase = useCases.find((artifact) => artifact.requirement.id === requirement.id) ?? null;
      const spec = specs.find((artifact) => artifact.useCase.requirement.id === requirement.id) ?? null;
      const diagram = diagrams.find((artifact) => artifact.source === requirement.code) ?? null;
      const task = tasks.find((artifact) => artifact.spec.useCase.requirement.id === requirement.id) ?? null;
      rows.push({
        id: `trace-${requirement.id}-missing-chain`,
        stakeholder: 'Stakeholder pendiente',
        technique: 'Tecnica pendiente',
        evidence: 'Sin evidencia',
        finding: 'Sin hallazgo vinculado',
        requirement,
        useCase,
        spec,
        diagram,
        task,
        status: 'missing-evidence',
        statusLabel: 'Cadena incompleta',
        source: 'derived'
      });
    }

    return rows;
  });

  readonly traceRiskItems = computed(() => [
    {
      label: 'Tecnicas sin evidencia',
      count: this.techniquesWithoutEvidenceCount(),
      action: 'Completar evidencia',
      module: 'evidences' as ModuleKey
    },
    {
      label: 'Evidencias sin hallazgos',
      count: this.sessionsForFindings().filter((session) => session.finding_count < 1).length,
      action: 'Generar hallazgos',
      module: 'findings' as ModuleKey
    },
    {
      label: 'Hallazgos sin requisito',
      count: this.orphanFindingsCount(),
      action: 'Crear requisitos',
      module: 'requirements' as ModuleKey
    },
    {
      label: 'Requisitos sin cadena real',
      count: this.incompleteRequirementsCount(),
      action: 'Auditar trazabilidad',
      module: 'traceability' as ModuleKey
    },
    {
      label: 'Specs derivadas sin persistencia',
      count: this.specArtifacts().length,
      action: 'Revisar specs',
      module: 'specs' as ModuleKey
    },
    {
      label: 'Tareas derivadas sin persistencia',
      count: this.agentTasks().length,
      action: 'Revisar implementacion',
      module: 'agent' as ModuleKey
    }
  ]);

  readonly projectReady = computed(() => this.requirementReadiness().score >= 20 && this.requirementReadiness().errors.length === 0);

  readonly recommendedAction = computed(() => {
    if (!this.project()?.name || !(this.project()?.objective || this.project()?.description)) {
      return { module: 'context' as ModuleKey, label: 'Completar contexto del proyecto' };
    }
    if (this.stakeholders().length === 0) {
      return { module: 'stakeholders' as ModuleKey, label: 'Registrar stakeholders fuente' };
    }
    if (this.processes().length === 0) {
      return { module: 'processes' as ModuleKey, label: 'Documentar procesos del negocio' };
    }
    if (this.sessions().length === 0) {
      return { module: 'techniques' as ModuleKey, label: 'Registrar primera tecnica' };
    }
    if (this.techniquesWithoutEvidenceCount() > 0) {
      return { module: 'evidences' as ModuleKey, label: 'Completar evidencias pendientes' };
    }
    if (this.findings().length === 0) {
      return { module: 'findings' as ModuleKey, label: 'Crear hallazgos desde evidencias' };
    }
    if (this.orphanFindingsCount() > 0) {
      return { module: 'requirements' as ModuleKey, label: 'Cubrir hallazgos con requisitos' };
    }
    if (this.requirements().length > 0 && this.specArtifacts().length === 0) {
      return { module: 'specs' as ModuleKey, label: 'Generar specs desde requisitos' };
    }
    if (this.requirementReadiness().warnings.length > 0) {
      return { module: 'validation' as ModuleKey, label: 'Resolver warnings del paquete' };
    }
    return { module: 'traceability' as ModuleKey, label: 'Validar cadena de trazabilidad' };
  });

  readonly pipelineSteps = computed(() => [
    { label: 'Contexto', complete: Boolean(this.project()?.name && (this.project()?.objective || this.project()?.description)), module: 'context' as ModuleKey },
    { label: 'Stakeholders', complete: this.stakeholders().length > 0, module: 'stakeholders' as ModuleKey },
    { label: 'Procesos', complete: this.processes().length > 0, module: 'processes' as ModuleKey },
    { label: 'Tecnicas', complete: this.sessions().length > 0, module: 'techniques' as ModuleKey },
    { label: 'Evidencias', complete: this.evidenceCount() > 0 && this.techniquesWithoutEvidenceCount() === 0, module: 'evidences' as ModuleKey },
    { label: 'Hallazgos', complete: this.findings().length > 0, module: 'findings' as ModuleKey },
    { label: 'Requisitos', complete: this.requirements().length > 0 && this.orphanFindingsCount() === 0, module: 'requirements' as ModuleKey },
    { label: 'Casos', complete: this.useCaseArtifacts().some((useCase) => useCase.persistedId), module: 'useCases' as ModuleKey },
    { label: 'Specs', complete: this.specArtifacts().length > 0, module: 'specs' as ModuleKey },
    { label: 'Validacion', complete: this.requirementReadiness().errors.length === 0 && this.requirementReadiness().warnings.length === 0, module: 'validation' as ModuleKey },
    { label: 'Entrega', complete: this.requirementReadiness().score >= 70 && this.agentTasks().length > 0, module: 'agent' as ModuleKey },
    { label: 'Trazabilidad', complete: this.traceabilityHealth() === 100 && this.requirements().length > 0, module: 'traceability' as ModuleKey }
  ]);

  // Loading starts from the route id because everything in the workspace belongs to one project.
  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectsService: ProjectsService,
    private readonly processesService: ProcessesService,
    private readonly traceabilityService: TraceabilityService,
    private readonly usersService: UsersService
  ) {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('ID de proyecto invalido.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.loadSavedDiagrams(id);
      this.loadManagedProjectFiles(id);
      this.loadImplementationInputs(id);
      this.refresh(id);
    });
  }

  setActiveModule(module: ModuleKey) {
    this.activeModule.set(module);
    this.error.set(null);
    this.success.set(null);
    if (module === 'projectFiles' && !this.projectFileDraft()) {
      const firstFile = this.projectArtifactFiles()[0];
      if (firstFile) {
        this.selectProjectFile(firstFile.id);
      }
    }
  }

  toggleTheme() {
    this.darkMode.update((value) => !value);
  }

  setActiveTechnique(module: CaptureModuleKey) {
    this.activeTechnique.set(module);
    this.error.set(null);
    this.success.set(null);
  }

  onInterviewFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedInterviewFiles.set(Array.from(input.files ?? []));
  }

  onDocumentFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedDocumentFiles.set(Array.from(input.files ?? []));
  }

  setTraceView(view: TraceViewKey) {
    this.activeTraceView.set(view);
  }

  goToReadinessIssue(issue: ReadinessIssue) {
    this.setActiveModule(issue.module);
    if (issue.module === 'traceability') {
      this.activeTraceView.set('risks');
    }
  }

  onTrackingProcessChange() {
    const processId = this.trackingForm.get('process_id')?.value;
    const subprocessId = this.trackingForm.get('subprocess_id')?.value;
    if (subprocessId && !this.subprocesses().some((subprocess) => subprocess.id === subprocessId && subprocess.process_id === processId)) {
      this.trackingForm.patchValue({ subprocess_id: null });
    }
  }

  addTransactionStep() {
    this.transactionSteps.set([
      ...this.transactionSteps(),
      {
        name: '',
        actorStakeholderId: null,
        actorRole: '',
        system: '',
        channel: '',
        input: '',
        action: '',
        output: '',
        duration: '',
        waitTime: '',
        issue: '',
        bottleneck: '',
        handoffTo: '',
        evidenceRef: '',
        notes: ''
      }
    ]);
  }

  removeTransactionStep(index: number) {
    const next = this.transactionSteps().filter((_, itemIndex) => itemIndex !== index);
    this.transactionSteps.set(next.length > 0 ? next : [{
      name: '',
      actorStakeholderId: null,
      actorRole: '',
      system: '',
      channel: '',
      input: '',
      action: '',
      output: '',
      duration: '',
      waitTime: '',
      issue: '',
      bottleneck: '',
      handoffTo: '',
      evidenceRef: '',
      notes: ''
    }]);
  }

  updateTransactionStep(index: number, field: keyof TransactionTrackingStepDraft, value: string | number | null) {
    this.transactionSteps.update((steps) =>
      steps.map((step, itemIndex) =>
        itemIndex === index
          ? { ...step, [field]: field === 'actorStakeholderId' ? (value ? Number(value) : null) : String(value ?? '') }
          : step
      )
    );
  }

  openDerivedSpecs() {
    if (this.requirements().length === 0) {
      this.error.set('Necesitas requisitos para derivar historias, specs y tareas.');
      return;
    }
    this.setActiveModule('specs');
  }

  openDerivedAgentTasks() {
    if (this.specArtifacts().length === 0) {
      this.error.set('Necesitas specs derivadas para revisar tareas tecnicas.');
      return;
    }
    this.setActiveModule('agent');
  }

  // Diagram editing stays local first; saving it adds the editable JSON to the project folder.
  async generateEditableDiagram(kind: DiagramKind = 'use_case') {
    const projectId = this.projectId();
    const useCases = this.useCaseArtifacts();
    if (useCases.length === 0 && kind !== 'free') {
      this.error.set('Necesitas requisitos para generar un diagrama editable.');
      return;
    }

    const builders: Record<DiagramKind, () => DiagramModel> = {
      use_case: () => this.buildUseCaseDiagram(projectId, useCases),
      class: () => this.buildClassDiagram(projectId, useCases),
      sequence: () => this.buildSequenceDiagram(projectId, useCases),
      package: () => this.buildPackageDiagram(projectId, useCases),
      component: () => this.buildComponentDiagram(projectId, useCases),
      free: () => this.ensureDiagram()
    };

    const baseDiagram = builders[kind]();
    const nextDiagram = kind === 'sequence' ? baseDiagram : await this.layoutDiagram(baseDiagram);
    this.diagram.set(nextDiagram);
    this.selectedDiagramNodeId.set(null);
    this.selectedDiagramEdgeId.set(null);
    this.connectSourceNodeId.set(null);
    this.selectedSavedDiagramId.set(null);
    this.exportedDiagramJson.set(null);
    this.success.set('Diagrama editable generado desde requisitos, procesos y contratos.');
  }

  // I keep connection mode explicit so selecting, dragging, and linking nodes do not fight each other.
  setDiagramMode(mode: DiagramEditorMode) {
    this.diagramMode.set(mode);
    this.connectSourceNodeId.set(null);
  }

  addDiagramNode(type: DiagramNodeType) {
    const current = this.ensureDiagram();
    const count = current.nodes.length + 1;
    const defaults = this.diagramNodeVisualDefaults(type);
    const node: DiagramNode = {
      id: `node-${Date.now()}-${count}`,
      type,
      label: this.defaultDiagramNodeLabel(type, count),
      x: 90 + (count % 4) * 150,
      y: 80 + Math.floor(count / 4) * 110,
      width: type === 'actor' ? 96 : type === 'lifeline' ? 130 : type === 'decision' ? 96 : 150,
      height: type === 'actor' ? 64 : type === 'lifeline' ? 360 : type === 'decision' ? 96 : 68,
      ...defaults
    };
    this.diagram.set({ ...current, nodes: [...current.nodes, node] });
    this.selectedDiagramNodeId.set(node.id);
    this.selectedDiagramEdgeId.set(null);
  }

  startDiagramConnection() {
    const node = this.selectedDiagramNode();
    if (!node) {
      this.error.set('Selecciona un nodo para iniciar una conexion.');
      return;
    }
    this.diagramMode.set('connect');
    this.connectSourceNodeId.set(node.id);
    this.success.set(`Conectando desde ${node.label}. Selecciona el nodo destino.`);
  }

  selectDiagramNode(nodeId: string) {
    this.selectedDiagramNodeId.set(nodeId);
    this.selectedDiagramEdgeId.set(null);
  }

  selectDiagramEdge(edgeId: string, event?: Event) {
    event?.stopPropagation();
    this.selectedDiagramEdgeId.set(edgeId);
    this.selectedDiagramNodeId.set(null);
  }

  onDiagramNodePointerDown(event: PointerEvent, nodeId: string) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    if (this.diagramMode() === 'connect') {
      this.completeDiagramConnection(nodeId);
      return;
    }

    const node = this.diagram()?.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const point = this.diagramPoint(event);
    this.selectDiagramNode(nodeId);
    this.draggingNode.set({ nodeId, offsetX: point.x - node.x, offsetY: point.y - node.y });
  }

  startDiagramNodeResize(event: PointerEvent, nodeId: string, handle: DiagramResizeHandle) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const node = this.diagram()?.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const point = this.diagramPoint(event);
    this.selectDiagramNode(nodeId);
    this.resizingNode.set({
      nodeId,
      handle,
      startX: point.x,
      startY: point.y,
      startWidth: node.width,
      startHeight: node.height,
      startNodeX: node.x,
      startNodeY: node.y
    });
  }

  startDiagramPortConnection(event: PointerEvent, nodeId: string) {
    event.stopPropagation();
    this.selectDiagramNode(nodeId);
    this.diagramMode.set('connect');
    this.connectSourceNodeId.set(nodeId);
    const node = this.diagram()?.nodes.find((item) => item.id === nodeId);
    this.success.set(`Conectando desde ${node?.label ?? 'nodo'}. Selecciona el nodo destino.`);
  }

  onDiagramPointerMove(event: PointerEvent) {
    if (this.isPanning) {
      const svg = (event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : (event.currentTarget as Element).closest('svg')) as SVGSVGElement | null;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        const scaleX = viewBox.width / rect.width;
        this.diagramPanX.update(v => v + (event.clientX - this.lastPanClient.x) * scaleX);
        this.diagramPanY.update(v => v + (event.clientY - this.lastPanClient.y) * scaleX);
      }
      this.lastPanClient = { x: event.clientX, y: event.clientY };
      return;
    }
    const resizing = this.resizingNode();
    const dragging = this.draggingNode();
    const current = this.diagram();
    if (!current) {
      return;
    }
    const point = this.diagramPoint(event);
    if (resizing) {
      const nextNodes = current.nodes.map((node) =>
        node.id === resizing.nodeId ? this.resizedDiagramNode(node, resizing, point.x, point.y) : node
      );
      this.diagram.set({ ...current, nodes: nextNodes });
      return;
    }
    if (!dragging) {
      return;
    }
    const nextNodes = current.nodes.map((node) =>
      node.id === dragging.nodeId
        ? { ...node, x: Math.max(16, point.x - dragging.offsetX), y: Math.max(16, point.y - dragging.offsetY) }
        : node
    );
    this.diagram.set({ ...current, nodes: nextNodes });
  }

  stopDiagramDrag() {
    this.draggingNode.set(null);
    this.resizingNode.set(null);
    this.isPanning = false;
  }

  onDiagramSvgPointerDown(event: PointerEvent) {
    if (event.button === 1) {
      event.preventDefault();
      this.isPanning = true;
      this.lastPanClient = { x: event.clientX, y: event.clientY };
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    }
  }

  onDiagramWheel(event: WheelEvent) {
    event.preventDefault();
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const mouseVBX = (event.clientX - rect.left) * scaleX + viewBox.x;
    const mouseVBY = (event.clientY - rect.top) * scaleX + viewBox.y;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = this.diagramZoom();
    const newZoom = Math.min(4, Math.max(0.15, zoom * factor));
    const ratio = newZoom / zoom;
    this.diagramZoom.set(newZoom);
    this.diagramPanX.update(v => mouseVBX + (v - mouseVBX) * ratio);
    this.diagramPanY.update(v => mouseVBY + (v - mouseVBY) * ratio);
  }

  diagramZoomIn() {
    const zoom = this.diagramZoom();
    const cx = 480, cy = 280;
    const newZoom = Math.min(4, zoom * 1.25);
    const ratio = newZoom / zoom;
    this.diagramZoom.set(newZoom);
    this.diagramPanX.update(v => cx + (v - cx) * ratio);
    this.diagramPanY.update(v => cy + (v - cy) * ratio);
  }

  diagramZoomOut() {
    const zoom = this.diagramZoom();
    const cx = 480, cy = 280;
    const newZoom = Math.max(0.15, zoom / 1.25);
    const ratio = newZoom / zoom;
    this.diagramZoom.set(newZoom);
    this.diagramPanX.update(v => cx + (v - cx) * ratio);
    this.diagramPanY.update(v => cy + (v - cy) * ratio);
  }

  resetDiagramZoom() {
    this.diagramZoom.set(1);
    this.diagramPanX.set(0);
    this.diagramPanY.set(0);
  }

  fitDiagramToContent() {
    const nodes = this.diagram()?.nodes;
    if (!nodes?.length) return;
    const pad = 48;
    const minX = Math.min(...nodes.map(n => n.x)) - pad;
    const minY = Math.min(...nodes.map(n => n.y)) - pad;
    const maxX = Math.max(...nodes.map(n => n.x + n.width)) + pad;
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const vbW = 960, vbH = 560;
    const newZoom = Math.min(vbW / contentW, vbH / contentH, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.diagramZoom.set(newZoom);
    this.diagramPanX.set(vbW / 2 - cx * newZoom);
    this.diagramPanY.set(vbH / 2 - cy * newZoom);
  }

  exportDiagramSVG() {
    const svgStr = this.buildExportSVGString();
    if (!svgStr) return;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    this.triggerDownload(blob, `${this.diagram()?.name ?? 'diagrama'}.svg`);
  }

  exportDiagramPNG() {
    const svgStr = this.buildExportSVGString();
    if (!svgStr) return;
    const nodes = this.diagram()?.nodes ?? [];
    const pad = 48;
    const minX = Math.min(...nodes.map(n => n.x)) - pad;
    const minY = Math.min(...nodes.map(n => n.y)) - pad;
    const w = Math.max(...nodes.map(n => n.x + n.width)) + pad - minX;
    const h = Math.max(...nodes.map(n => n.y + n.height)) + pad - minY;
    const scale = 2;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(png => {
        if (png) this.triggerDownload(png, `${this.diagram()?.name ?? 'diagrama'}.png`);
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  private buildExportSVGString(): string | null {
    const svgEl = document.querySelector('.diagram-canvas svg') as SVGSVGElement | null;
    const nodes = this.diagram()?.nodes;
    if (!svgEl || !nodes?.length) return null;

    const pad = 48;
    const minX = Math.min(...nodes.map(n => n.x)) - pad;
    const minY = Math.min(...nodes.map(n => n.y)) - pad;
    const w = Math.max(...nodes.map(n => n.x + n.width)) + pad - minX;
    const h = Math.max(...nodes.map(n => n.y + n.height)) + pad - minY;

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.diagram-node-controls').forEach(el => el.remove());

    // Remove zoom/pan transform from the content group
    for (const child of Array.from(clone.children)) {
      if (child.tagName.toLowerCase() === 'g' && child.hasAttribute('transform')) {
        child.removeAttribute('transform');
        break;
      }
    }

    clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = this.collectDiagramStyles();
    clone.insertBefore(styleEl, clone.firstChild);

    return new XMLSerializer().serializeToString(clone);
  }

  private collectDiagramStyles(): string {
    const keywords = ['diagram-', 'node-type', 'lifeline', 'package-tab', 'hidden-shape', 'edge-', 'connection-port'];
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (keywords.some(kw => rule.cssText.includes(kw))) {
            rules.push(rule.cssText);
          }
        }
      } catch { /* cross-origin sheet */ }
    }
    return rules.join('\n');
  }

  private triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  updateSelectedDiagramNodeLabel(value: string) {
    const node = this.selectedDiagramNode();
    const current = this.diagram();
    if (!node || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      nodes: current.nodes.map((item) => (item.id === node.id ? { ...item, label: value } : item))
    });
  }

  updateDiagramTitle(value: string) {
    const current = this.diagram();
    if (!current) {
      return;
    }
    this.diagram.set({ ...current, title: value });
  }

  updateSelectedDiagramEdgeLabel(value: string) {
    const edge = this.selectedDiagramEdge();
    const current = this.diagram();
    if (!edge || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      edges: current.edges.map((item) => (item.id === edge.id ? { ...item, label: value } : item))
    });
  }

  updateSelectedDiagramEdgeType(type: DiagramEdgeType) {
    const edge = this.selectedDiagramEdge();
    const current = this.diagram();
    if (!edge || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      edges: current.edges.map((item) => (item.id === edge.id ? { ...item, type } : item))
    });
  }

  updateSelectedDiagramEdgeNotes(value: string) {
    const edge = this.selectedDiagramEdge();
    const current = this.diagram();
    if (!edge || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      edges: current.edges.map((item) => (item.id === edge.id ? { ...item, notes: value || undefined } : item))
    });
  }

  updateSelectedDiagramNodeSize(field: 'width' | 'height', value: string) {
    const node = this.selectedDiagramNode();
    const current = this.diagram();
    if (!node || !current) {
      return;
    }
    const minimum = this.diagramNodeMinimumSize(node.type);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.diagram.set({
      ...current,
      nodes: current.nodes.map((item) =>
        item.id === node.id ? { ...item, [field]: Math.max(minimum[field], Math.round(parsed)) } : item
      )
    });
  }

  updateSelectedDiagramNodeType(type: DiagramNodeType) {
    const node = this.selectedDiagramNode();
    const current = this.diagram();
    if (!node || !current) {
      return;
    }
    const defaults = this.diagramNodeVisualDefaults(type);
    const minimum = this.diagramNodeMinimumSize(type);
    this.diagram.set({
      ...current,
      nodes: current.nodes.map((item) =>
        item.id === node.id
          ? {
              ...item,
              type,
              width: Math.max(item.width, minimum.width),
              height: Math.max(item.height, minimum.height),
              ...defaults
            }
          : item
      )
    });
  }

  updateSelectedDiagramNodeProperty(field: 'fill' | 'stroke' | 'textColor' | 'layer' | 'notes' | 'specId', value: string) {
    const node = this.selectedDiagramNode();
    const current = this.diagram();
    if (!node || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      nodes: current.nodes.map((item) => (item.id === node.id ? { ...item, [field]: value || undefined } : item))
    });
  }

  updateSelectedDiagramNodeRequirement(value: string) {
    const node = this.selectedDiagramNode();
    const current = this.diagram();
    const requirementId = Number(value);
    if (!node || !current) {
      return;
    }
    this.diagram.set({
      ...current,
      nodes: current.nodes.map((item) =>
        item.id === node.id
          ? { ...item, requirementId: Number.isFinite(requirementId) && requirementId > 0 ? requirementId : undefined }
          : item
      )
    });
  }

  deleteSelectedDiagramElement() {
    const current = this.diagram();
    if (!current) {
      return;
    }
    const nodeId = this.selectedDiagramNodeId();
    const edgeId = this.selectedDiagramEdgeId();
    if (nodeId) {
      this.diagram.set({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId)
      });
      this.selectedDiagramNodeId.set(null);
      return;
    }
    if (edgeId) {
      this.diagram.set({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) });
      this.selectedDiagramEdgeId.set(null);
    }
  }

  async autoLayoutDiagram() {
    const current = this.diagram();
    if (!current) {
      return;
    }
    const nextDiagram = await this.layoutDiagram(current);
    this.diagram.set(nextDiagram);
    this.success.set('Layout recalculado para mejorar legibilidad.');
  }

  exportDiagramJson() {
    const current = this.diagram();
    if (!current) {
      this.error.set('No hay diagrama para exportar.');
      return;
    }
    this.exportedDiagramJson.set(JSON.stringify(current, null, 2));
    this.success.set('JSON del diagrama generado en el panel inferior.');
  }

  saveCurrentDiagram() {
    const current = this.diagram();
    const projectId = this.projectId();
    if (!current || !projectId) {
      this.error.set('No hay diagrama activo para guardar.');
      return;
    }

    const now = new Date().toISOString();
    const diagram: DiagramModel = {
      ...current,
      projectId,
      title: current.title?.trim() || `Diagrama ${current.type}`,
      derived: false
    };
    const selectedId = this.selectedSavedDiagramId();
    const existing = this.savedDiagrams();
    const entryId = selectedId && existing.some((entry) => entry.id === selectedId) ? selectedId : diagram.id;
    const entry: SavedDiagramEntry = {
      id: entryId,
      title: diagram.title,
      type: diagram.type,
      updatedAt: now,
      diagram: { ...diagram, id: entryId }
    };
    const next = existing.some((item) => item.id === entryId)
      ? existing.map((item) => (item.id === entryId ? entry : item))
      : [entry, ...existing];

    this.persistSavedDiagrams(projectId, next);
    this.diagram.set(entry.diagram);
    this.selectedSavedDiagramId.set(entry.id);
    this.exportedDiagramJson.set(JSON.stringify(entry.diagram, null, 2));
    this.success.set(`Diagrama "${entry.title}" guardado en la carpeta del proyecto.`);
  }

  openSavedDiagram(diagramId: string) {
    const entry = this.savedDiagrams().find((item) => item.id === diagramId);
    if (!entry) {
      this.error.set('No se encontro el diagrama guardado.');
      return;
    }
    this.diagram.set(entry.diagram);
    this.selectedSavedDiagramId.set(entry.id);
    this.selectedDiagramNodeId.set(null);
    this.selectedDiagramEdgeId.set(null);
    this.connectSourceNodeId.set(null);
    this.exportedDiagramJson.set(JSON.stringify(entry.diagram, null, 2));
    this.success.set(`Diagrama "${entry.title}" abierto.`);
  }

  openDerivedDiagram(diagramId: string) {
    const artifact = this.diagramArtifacts().find((item) => item.id === diagramId);
    if (!artifact) {
      this.error.set('No se encontro el diagrama derivado.');
      return;
    }
    this.diagram.set({ ...artifact.diagram, nodes: artifact.diagram.nodes.map((node) => ({ ...node })), edges: artifact.diagram.edges.map((edge) => ({ ...edge })) });
    this.selectedSavedDiagramId.set(null);
    this.selectedDiagramNodeId.set(null);
    this.selectedDiagramEdgeId.set(null);
    this.connectSourceNodeId.set(null);
    this.exportedDiagramJson.set(JSON.stringify(artifact.diagram, null, 2));
    this.success.set(`Diagrama derivado "${artifact.title}" abierto para edicion.`);
  }

  deleteSavedDiagram(diagramId: string) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    const next = this.savedDiagrams().filter((entry) => entry.id !== diagramId);
    this.persistSavedDiagrams(projectId, next);
    if (this.selectedSavedDiagramId() === diagramId) {
      this.selectedSavedDiagramId.set(null);
    }
    this.success.set('Diagrama eliminado de la carpeta local del proyecto.');
  }

  downloadCurrentDiagramJson() {
    const current = this.diagram();
    if (!current) {
      this.error.set('No hay diagrama para descargar.');
      return;
    }
    this.downloadText(`${slugify(current.title)}.drawio-lite.json`, JSON.stringify(current, null, 2), 'application/json');
  }

  downloadCurrentDiagramDrawio() {
    const current = this.diagram();
    if (!current) {
      this.error.set('No hay diagrama para descargar.');
      return;
    }
    this.downloadText(`${slugify(current.title)}.drawio`, this.buildDrawioXml(current), 'application/xml;charset=utf-8');
    this.success.set('Diagrama .drawio descargado para abrirlo en diagrams.net.');
  }

  importDiagramFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        const diagram = this.normalizeImportedDiagram(parsed);
        this.diagram.set(diagram);
        this.selectedSavedDiagramId.set(null);
        this.exportedDiagramJson.set(JSON.stringify(diagram, null, 2));
        this.success.set('Diagrama importado. Usa Guardar para anexarlo a la carpeta del proyecto.');
      } catch {
        this.error.set('El archivo no contiene un diagrama valido.');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  exportProjectBundle() {
    this.exportProjectZip();
  }

  // I keep JSON export for debugging, but ZIP is the real handoff format.
  downloadProjectBundleJson() {
    const project = this.project();
    const bundle = {
      exported_at: new Date().toISOString(),
      project,
      files: this.projectArtifactFiles().map((file) => ({
        path: this.projectFilePath(file),
        kind: file.kind,
        encoding: file.encoding,
        mime_type: file.mime_type,
        content: file.content
      }))
    };
    this.downloadText(
      `${slugify(project?.name ?? `proyecto-${this.projectId() ?? 'workspace'}`)}-paquete-proyecto.json`,
      JSON.stringify(bundle, null, 2),
      'application/json'
    );
    this.success.set('Paquete del proyecto generado con specs, tareas y diagramas.');
  }

  downloadAiSpecHandoffPackage() {
    const project = this.project();
    this.downloadText(
      `${slugify(project?.name ?? `proyecto-${this.projectId() ?? 'workspace'}`)}-handoff-tecnico.json`,
      JSON.stringify(this.aiSpecHandoffPackage(), null, 2),
      'application/json'
    );
    this.success.set('Paquete tecnico de specs generado.');
  }

  async exportProjectZip() {
    const project = this.project();
    const files = this.projectArtifactFiles().map((file) => ({
      path: this.projectFilePath(file),
      content: file.encoding === 'data_url' ? dataUrlToBytes(file.content) : file.content
    }));
    const manifest = {
      exported_at: new Date().toISOString(),
      project,
      file_count: files.length,
      format: 'specora-project-folder-v2',
      implementation_profile: this.activeAgentProfile(),
      offline_only: true
    };
    files.unshift({
      path: 'manifest.json',
      content: JSON.stringify(manifest, null, 2)
    });
    const blob = createZipBlob(files);
    this.downloadBlob(`${slugify(project?.name ?? `proyecto-${this.projectId() ?? 'workspace'}`)}.zip`, blob);
    this.success.set('ZIP del proyecto generado.');
  }

  async exportImplementationSpecsZip() {
    const readiness = this.requirementReadiness();
    if (readiness.errors.some((issue) => issue.code === 'NO_REQUIREMENTS')) {
      this.error.set('No puedes exportar specs implementables sin requisitos o casos de uso documentados.');
      this.setActiveModule('validation');
      return;
    }
    const projectId = this.projectId();
    const files = buildImplementationSpecFiles({
      project: this.project(),
      projectId,
      stakeholders: this.stakeholders(),
      processes: this.processes(),
      sessions: this.sessions(),
      findings: this.findings(),
      requirements: this.requirements(),
      useCases: this.useCaseArtifacts(),
      diagrams: this.diagramArtifacts(),
      savedDiagrams: this.savedDiagrams(),
      targetStack: this.targetStack(),
      implementationContracts: this.implementationContracts(),
      dataEntities: this.dataEntities(),
      targetRoles: this.targetRoles(),
      designInputs: this.designInputFiles(),
      readiness
    });
    const blob = createZipBlob(files);
    this.downloadBlob(`specs_proyecto_${projectId ?? 'workspace'}.zip`, blob);
    this.success.set(
      readiness.warnings.length > 0
        ? `Specs implementables generadas con ${readiness.warnings.length} warning(s) de validacion.`
        : 'Specs implementables generadas con formato 01-08.'
    );
  }

  // File edits live in local project storage so generated files can be customized without losing the source artifact.
  selectProjectFile(fileId: string) {
    const file = this.projectArtifactFiles().find((item) => item.id === fileId);
    if (!file) {
      return;
    }
    this.selectedProjectFileId.set(file.id);
    this.projectFileDraft.set({
      folder: file.folder,
      name: file.name,
      kind: file.kind,
      content: file.content
    });
  }

  updateProjectFileDraft(field: keyof ProjectFileDraft, value: string) {
    const current = this.projectFileDraft() ?? {
      folder: '',
      name: '',
      kind: 'Archivo',
      content: ''
    };
    this.projectFileDraft.set({ ...current, [field]: value });
  }

  saveProjectFileDraft() {
    const projectId = this.projectId();
    const selected = this.selectedProjectFile();
    const draft = this.projectFileDraft();
    if (!projectId || !selected || !draft) {
      this.error.set('Selecciona un archivo para guardar cambios.');
      return;
    }
    const file: ProjectArtifactFile = {
      id: selected.id,
      folder: this.cleanProjectFolderPart(draft.folder || selected.folder),
      name: cleanProjectFilePart(draft.name || selected.name),
      kind: draft.kind || selected.kind,
      content: selected.encoding === 'data_url' ? selected.content : draft.content ?? '',
      encoding: selected.encoding ?? 'text',
      mime_type: selected.mime_type,
      size_bytes: selected.size_bytes,
      source: selected.source === 'generated' ? 'edited' : selected.source,
      updatedAt: new Date().toISOString()
    };
    this.upsertManagedProjectFile(projectId, file);
    this.selectedProjectFileId.set(file.id);
    this.projectFileDraft.set({ folder: file.folder, name: file.name, kind: file.kind, content: file.content });
    this.success.set(`Archivo "${file.name}" guardado.`);
  }

  addProjectTextFile() {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    const now = Date.now();
    const file: ProjectArtifactFile = {
      id: `custom-${now}`,
      folder: '04-personalizados',
      name: `nota-${now}.md`,
      kind: 'Personalizado',
      content: '# Nuevo archivo\n\n',
      encoding: 'text',
      source: 'custom',
      updatedAt: new Date().toISOString()
    };
    this.upsertManagedProjectFile(projectId, file);
    this.selectProjectFile(file.id);
    this.success.set('Archivo personalizado creado.');
  }

  deleteProjectFile() {
    const projectId = this.projectId();
    const selected = this.selectedProjectFile();
    if (!projectId || !selected) {
      return;
    }
    const managed = this.managedProjectFiles().filter((file) => file.id !== selected.id);
    const deleted = new Set(this.deletedGeneratedProjectFileIds());
    if (this.generatedProjectArtifactFiles().some((file) => file.id === selected.id)) {
      deleted.add(selected.id);
    }
    this.persistManagedProjectFiles(projectId, managed, [...deleted]);
    const next = this.projectArtifactFiles().find((file) => file.id !== selected.id) ?? null;
    this.selectedProjectFileId.set(next?.id ?? null);
    this.projectFileDraft.set(next ? { folder: next.folder, name: next.name, kind: next.kind, content: next.content } : null);
    this.success.set('Archivo removido de la carpeta del proyecto.');
  }

  restoreGeneratedProjectFile() {
    const projectId = this.projectId();
    const selected = this.selectedProjectFile();
    if (!projectId || !selected) {
      return;
    }
    const generated = this.generatedProjectArtifactFiles().find((file) => file.id === selected.id);
    if (!generated) {
      this.error.set('Este archivo no proviene de un artefacto generado.');
      return;
    }
    const managed = this.managedProjectFiles().filter((file) => file.id !== selected.id);
    const deleted = this.deletedGeneratedProjectFileIds().filter((id) => id !== selected.id);
    this.persistManagedProjectFiles(projectId, managed, deleted);
    this.selectProjectFile(generated.id);
    this.success.set('Archivo restaurado desde el artefacto generado.');
  }

  downloadSelectedProjectFile() {
    const selected = this.selectedProjectFile();
    if (!selected) {
      return;
    }
    if (selected.encoding === 'data_url') {
      this.downloadBlob(selected.name, new Blob([dataUrlToBytes(selected.content)], { type: selected.mime_type ?? 'application/octet-stream' }));
      return;
    }
    this.downloadText(selected.name, selected.content, 'text/plain;charset=utf-8');
  }

  // Imports support the project bundle and loose files, which makes rehydrating a workspace simple.
  async importProjectFolderFile(event: Event) {
    const projectId = this.projectId();
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!projectId || files.length === 0) {
      return;
    }
    try {
      const imported: ProjectArtifactFile[] = [];
      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zipFiles = readZipEntries(await file.arrayBuffer());
          imported.push(...zipFiles.map((entry) => projectFileFromPath(entry.path, entry.content, 'imported')));
          continue;
        }
        if (this.isImageProjectFileName(file.name)) {
          imported.push({
            id: `imported-${Date.now()}-${imported.length}`,
            folder: '07_DESIGN_IDEAS',
            name: cleanProjectFilePart(file.name),
            kind: 'Imagen de diseno',
            content: await this.readFileAsDataUrl(file),
            encoding: 'data_url',
            mime_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            source: 'imported',
            updatedAt: new Date().toISOString()
          });
          continue;
        }
        const content = await file.text();
        if (file.name.toLowerCase().endsWith('.json')) {
          const bundleFiles = tryReadBundleFiles(content);
          if (bundleFiles.length > 0) {
            imported.push(...bundleFiles.map((entry) => projectFileFromPath(entry.path, entry.content, 'imported')));
            continue;
          }
        }
        const isDesignInput = this.isDesignIdeaFileName(file.name);
        imported.push({
          id: `imported-${Date.now()}-${imported.length}`,
          folder: isDesignInput ? '07_DESIGN_IDEAS' : '04-importados',
          name: cleanProjectFilePart(file.name),
          kind: isDesignInput ? 'Insumo de diseno para 07_DESIGN' : 'Importado',
          content,
          encoding: 'text',
          mime_type: file.type || 'text/plain',
          size_bytes: file.size,
          source: 'imported',
          updatedAt: new Date().toISOString()
        });
      }
      const next = [...this.managedProjectFiles()];
      for (const file of imported) {
        const uniqueFile = { ...file, id: `${file.id}-${slugify(file.folder)}-${slugify(file.name)}` };
        next.push(uniqueFile);
      }
      this.persistManagedProjectFiles(projectId, next, this.deletedGeneratedProjectFileIds());
      if (imported[0]) {
        this.selectProjectFile(next[next.length - imported.length].id);
      }
      this.success.set(`Se importaron ${imported.length} archivo(s) a la carpeta del proyecto.`);
    } catch {
      this.error.set('No se pudo importar el paquete o archivo seleccionado.');
    } finally {
      input.value = '';
    }
  }

  diagramNodeCenter(nodeId: string) {
    const node = this.diagram()?.nodes.find((item) => item.id === nodeId);
    return node ? { x: node.x + node.width / 2, y: node.y + node.height / 2 } : { x: 0, y: 0 };
  }

  diagramNodeResizeHandles(node: DiagramNode) {
    return [
      { handle: 'nw' as const, x: 0, y: 0 },
      { handle: 'ne' as const, x: node.width, y: 0 },
      { handle: 'sw' as const, x: 0, y: node.height },
      { handle: 'se' as const, x: node.width, y: node.height },
      { handle: 'e' as const, x: node.width, y: node.height / 2 },
      { handle: 's' as const, x: node.width / 2, y: node.height }
    ];
  }

  diagramNodeConnectionPorts(node: DiagramNode) {
    return [
      { x: node.width / 2, y: 0 },
      { x: node.width, y: node.height / 2 },
      { x: node.width / 2, y: node.height },
      { x: 0, y: node.height / 2 }
    ];
  }

  diagramNodeClass(node: DiagramNode) {
    const classes = [`diagram-node`, `node-${node.type}`];
    if (this.selectedDiagramNodeId() === node.id) {
      classes.push('selected');
    }
    if (this.connectSourceNodeId() === node.id) {
      classes.push('connecting');
    }
    return classes.join(' ');
  }

  diagramNodeLines(node: DiagramNode) {
    const maxLength = node.type === 'class' ? 34 : 28;
    return node.label
      .split('\n')
      .flatMap((line) => (line.length > maxLength ? [`${line.slice(0, maxLength - 3)}...`] : [line]))
      .slice(0, node.type === 'class' ? 7 : 3);
  }

  diagramKindLabel(kind: DiagramKind) {
    const labels: Record<DiagramKind, string> = {
      use_case: 'Casos de uso',
      class: 'Modelo de clases',
      sequence: 'Secuencia',
      package: 'Paquetes',
      component: 'Componentes',
      free: 'Canvas libre'
    };
    return labels[kind] ?? kind;
  }

  diagramNodeTypeLabel(type: DiagramNodeType) {
    const labels: Record<DiagramNodeType, string> = {
      actor: 'Actor',
      use_case: 'Proceso / caso de uso',
      class: 'Clase',
      package: 'Paquete',
      component: 'Componente',
      process: 'Proceso',
      decision: 'Decision',
      database: 'Base de datos',
      service: 'Servicio',
      screen: 'Pantalla',
      api: 'API',
      queue: 'Cola / mensajeria',
      requirement: 'Requisito',
      spec: 'Spec',
      note: 'Nota',
      lifeline: 'Lifeline',
      boundary: 'Limite / sistema'
    };
    return labels[type] ?? type;
  }

  diagramEdgeTypeLabel(type: DiagramEdgeType) {
    const labels: Record<DiagramEdgeType, string> = {
      association: 'Asociacion',
      include: 'Include',
      extend: 'Extend',
      dependency: 'Dependencia',
      inheritance: 'Herencia',
      composition: 'Composicion',
      aggregation: 'Agregacion',
      message: 'Mensaje',
      data_flow: 'Flujo de datos'
    };
    return labels[type] ?? type;
  }

  diagramNodeRequirement(node: DiagramNode) {
    return node.requirementId ? this.requirements().find((requirement) => requirement.id === node.requirementId) ?? null : null;
  }

  moduleSessions(module: CaptureModuleKey) {
    const technique = this.techniqueModules.find((item) => item.key === module)?.technique;
    return this.sessions().filter((session) => session.technique === technique);
  }

  trackingSessions() {
    return this.sessions().filter((session) => this.isTrackingSession(session));
  }

  processSubprocesses(processId: number) {
    return this.subprocesses().filter((subprocess) => subprocess.process_id === processId);
  }

  processTrackingCount(processId: number) {
    return this.trackingSessions().filter((session) => session.process_id === processId).length;
  }

  startTrackingForProcess(process: Process, subprocess?: Subprocess) {
    this.trackingForm.patchValue({
      process_id: process.id,
      subprocess_id: subprocess?.id ?? null,
      title: this.trackingForm.getRawValue().title || `Seguimiento: ${process.name}`
    });
    this.onTrackingProcessChange();
    this.setActiveModule('techniques');
    this.setActiveTechnique('tracking');
  }

  trackingTransactionId(session: Session) {
    return this.metadataText(session, 'transactionId') || 'Sin ID de transaccion';
  }

  trackingTransactionType(session: Session) {
    return this.metadataText(session, 'transactionType') || 'Transaccion real';
  }

  trackingProcessName(session: Session) {
    return this.processes().find((process) => process.id === session.process_id)?.name ?? 'Proceso no vinculado';
  }

  trackingSubprocessName(session: Session) {
    if (!session.subprocess_id) {
      return null;
    }
    return this.subprocesses().find((subprocess) => subprocess.id === session.subprocess_id)?.name ?? null;
  }

  trackingPrimaryActor(session: Session) {
    const actorId = this.metadataNumber(session, 'primaryActorId');
    if (!actorId) {
      return 'Actor principal no definido';
    }
    const stakeholder = this.stakeholders().find((item) => item.id === actorId);
    return stakeholder ? `${stakeholder.name} (${stakeholder.role})` : 'Actor principal no encontrado';
  }

  trackingSystems(session: Session) {
    const systems = session.metadata?.['systemsInvolved'];
    if (!Array.isArray(systems)) {
      return 'Sistemas/canales no especificados';
    }
    const labels = systems.map((item) => String(item).trim()).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : 'Sistemas/canales no especificados';
  }

  trackingSteps(session: Session): TransactionTrackingStep[] {
    const steps = session.metadata?.['steps'];
    return Array.isArray(steps) ? steps as TransactionTrackingStep[] : [];
  }

  visibleTrackingSteps(session: Session) {
    return this.trackingSteps(session).slice(0, 3);
  }

  trackingRemainingStepCount(session: Session) {
    return Math.max(this.trackingSteps(session).length - 3, 0);
  }

  trackingProblems(session: Session): TransactionTrackingProblem[] {
    const problems = session.metadata?.['problems'];
    return Array.isArray(problems) ? problems as TransactionTrackingProblem[] : [];
  }

  trackingMetrics(session: Session): TransactionTrackingMetrics {
    const metrics = session.metadata?.['metrics'];
    return metrics && typeof metrics === 'object' ? metrics as TransactionTrackingMetrics : {};
  }

  trackingStepLabel(step: TransactionTrackingStep, index: number) {
    return `${step.order ?? index + 1}. ${step.name || step.action || 'Paso sin nombre'}`;
  }

  trackingStepActor(step: TransactionTrackingStep) {
    return this.trackingActorLabel(step.actorStakeholderId, step.actorRole ?? '');
  }

  createFindingFromTracking(session: Session) {
    const firstProblem = this.trackingProblems(session)[0];
    const firstStepWithIssue = this.trackingSteps(session).find((step) => step.issue);
    const statement = firstProblem?.description || firstStepWithIssue?.issue || '';
    this.findingForm.patchValue({
      session_id: session.id,
      category: 'problem',
      statement
    });
    this.setActiveModule('findings');
  }

  sessionEvidences(sessionId: number) {
    return this.evidencesBySession()[sessionId] ?? [];
  }

  sessionsForFindings() {
    return this.sessions().filter((session) => session.evidence_count > 0);
  }

  sessionsByDiscoveryType(type: DiscoveryType) {
    return this.sessions().filter((session) => session.discovery_type === type);
  }

  updateSessionDiscoveryType(session: Session, discoveryType: DiscoveryType) {
    this.updateSessionClassification(session, { discovery_type: discoveryType });
  }

  updateSessionStatus(session: Session, status: SessionStatus) {
    this.updateSessionClassification(session, { status });
  }

  selectedFinding(findingId: number) {
    const value = this.requirementForm.get('finding_ids')?.value ?? [];
    return value.includes(findingId);
  }

  toggleFinding(findingId: number) {
    const control = this.requirementForm.get('finding_ids');
    const current = control?.value ?? [];
    const next = current.includes(findingId)
      ? current.filter((item) => item !== findingId)
      : [...current, findingId];
    control?.setValue(next);
    control?.markAsDirty();
    control?.markAsTouched();
  }

  beginEditFinding(finding: Finding) {
    this.closeDocumentationDrawer();
    this.editingFindingId.set(finding.id);
    this.findingEditDraft.set({
      category: finding.category,
      statement: finding.statement
    });
  }

  updateFindingDraft(field: keyof FindingEditDraft, value: string) {
    const draft = this.findingEditDraft();
    if (!draft) {
      return;
    }
    this.findingEditDraft.set({
      ...draft,
      [field]: field === 'category' ? (value as Finding['category']) : value
    });
  }

  cancelEditFinding() {
    this.editingFindingId.set(null);
    this.findingEditDraft.set(null);
  }

  saveFindingEdit(findingId: number) {
    const projectId = this.projectId();
    const draft = this.findingEditDraft();
    if (!projectId || !draft || draft.statement.trim().length < 20) {
      this.error.set('El hallazgo debe tener al menos 20 caracteres.');
      return;
    }

    this.setSavingState();
    this.traceabilityService
      .updateFinding(projectId, findingId, {
        category: draft.category,
        statement: draft.statement.trim()
      })
      .subscribe({
        next: () => {
          this.success.set('Hallazgo actualizado.');
          this.cancelEditFinding();
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo actualizar el hallazgo.')
      });
  }

  beginEditRequirement(requirement: Requirement) {
    this.closeDocumentationDrawer();
    this.editingRequirementId.set(requirement.id);
    this.requirementEditDraft.set({
      type: requirement.type,
      priority: requirement.priority,
      description: requirement.description,
      acceptance_criteria: requirement.acceptance_criteria,
      finding_ids: [...(requirement.finding_ids ?? [])]
    });
  }

  updateRequirementDraft(field: keyof Omit<RequirementEditDraft, 'finding_ids'>, value: string) {
    const draft = this.requirementEditDraft();
    if (!draft) {
      return;
    }
    this.requirementEditDraft.set({
      ...draft,
      [field]: value
    } as RequirementEditDraft);
  }

  requirementDraftFindingSelected(findingId: number) {
    return this.requirementEditDraft()?.finding_ids.includes(findingId) ?? false;
  }

  toggleRequirementDraftFinding(findingId: number) {
    const draft = this.requirementEditDraft();
    if (!draft) {
      return;
    }
    this.requirementEditDraft.set({
      ...draft,
      finding_ids: draft.finding_ids.includes(findingId)
        ? draft.finding_ids.filter((id) => id !== findingId)
        : [...draft.finding_ids, findingId]
    });
  }

  cancelEditRequirement() {
    this.editingRequirementId.set(null);
    this.requirementEditDraft.set(null);
  }

  saveRequirementEdit(requirementId: number) {
    const projectId = this.projectId();
    const draft = this.requirementEditDraft();
    if (
      !projectId ||
      !draft ||
      draft.description.trim().length < 12 ||
      draft.acceptance_criteria.trim().length < 12 ||
      draft.finding_ids.length === 0
    ) {
      this.error.set('Completa descripcion, criterios y al menos un hallazgo fuente.');
      return;
    }

    this.setSavingState();
    this.traceabilityService
      .updateRequirement(projectId, requirementId, {
        type: draft.type,
        priority: draft.priority,
        description: draft.description.trim(),
        acceptance_criteria: draft.acceptance_criteria.trim(),
        finding_ids: draft.finding_ids
      })
      .subscribe({
        next: () => {
          this.success.set('Requisito actualizado. Specs, handoff y diagramas derivados ya usan el nuevo contenido.');
          this.cancelEditRequirement();
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo actualizar el requisito.')
      });
  }

  beginEditUseCase(useCase: DerivedUseCase) {
    this.closeDocumentationDrawer();
    this.editingUseCaseId.set(useCase.id);
    this.useCaseEditDraft.set({
      requirement_id: useCase.requirement.id,
      persistedId: useCase.persistedId,
      title: useCase.title,
      actor: useCase.actor,
      action: useCase.action,
      benefit: useCase.benefit,
      acceptance_criteria: useCase.acceptanceCriteria
    });
  }

  updateUseCaseDraft(field: keyof Omit<UseCaseEditDraft, 'requirement_id' | 'persistedId'>, value: string) {
    const draft = this.useCaseEditDraft();
    if (!draft) {
      return;
    }
    this.useCaseEditDraft.set({ ...draft, [field]: value });
  }

  cancelEditUseCase() {
    this.editingUseCaseId.set(null);
    this.useCaseEditDraft.set(null);
  }

  closeDocumentationDrawer() {
    this.cancelEditFinding();
    this.cancelEditRequirement();
    this.cancelEditUseCase();
  }

  saveUseCaseEdit() {
    const projectId = this.projectId();
    const draft = this.useCaseEditDraft();
    if (
      !projectId ||
      !draft ||
      draft.title.trim().length < 3 ||
      draft.actor.trim().length < 2 ||
      draft.action.trim().length < 3 ||
      draft.benefit.trim().length < 3
    ) {
      this.error.set('Completa titulo, actor, accion y beneficio del caso de uso.');
      return;
    }

    const payload = {
      title: draft.title.trim(),
      actor: draft.actor.trim(),
      action: draft.action.trim(),
      benefit: draft.benefit.trim(),
      acceptance_criteria: draft.acceptance_criteria.trim() || null
    };
    this.setSavingState();
    const request = draft.persistedId
      ? this.traceabilityService.updateUseCase(projectId, draft.persistedId, payload)
      : this.traceabilityService.createUseCase(projectId, {
          requirement_id: draft.requirement_id,
          ...payload
        });

    request.subscribe({
      next: () => {
        this.success.set('Caso de uso guardado y enlazado al requisito.');
        this.cancelEditUseCase();
        this.afterMutation(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo guardar el caso de uso.')
    });
  }

  private updateSessionClassification(
    session: Session,
    payload: { discovery_type?: DiscoveryType; status?: SessionStatus }
  ) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService.updateSession(projectId, session.id, payload).subscribe({
      next: () => {
        this.success.set('Sesion actualizada.');
        this.afterMutation(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo actualizar la sesion.')
    });
  }

  toggleSurveyStakeholder(stakeholderId: number) {
    const current = this.selectedSurveyStakeholderIds();
    this.selectedSurveyStakeholderIds.set(
      current.includes(stakeholderId) ? current.filter((id) => id !== stakeholderId) : [...current, stakeholderId]
    );
  }

  isSurveyStakeholderSelected(stakeholderId: number) {
    return this.selectedSurveyStakeholderIds().includes(stakeholderId);
  }

  // Questionnaires still use survey routes underneath, but the UI treats them as instruments.
  addSurveyQuestion() {
    this.surveyQuestionsDraft.set([
      ...this.surveyQuestionsDraft(),
      { question_text: '', question_type: 'short_text', required: false, optionsText: '', help_text: '' }
    ]);
  }

  generateSurveyQuestionsWithAI() {
    const value = this.surveyForm.getRawValue();
    const prompt = this.surveyAIPrompt().trim();
    const title = (value.title ?? '').trim();
    const description = (value.description ?? '').trim();
    const objective = (value.objective ?? '').trim();
    if (`${title} ${description} ${objective} ${prompt}`.trim().length < 8) {
      this.error.set('Completa titulo, descripcion u objetivo de la encuesta, o agrega un mini prompt.');
      return;
    }
    const suggestions = buildLocalQuestionnaireSuggestions({ title, description, objective, prompt });
    this.applySurveyQuestionSuggestions(suggestions);
    this.success.set(`Se generaron ${suggestions.length} pregunta(s) base editables desde la plantilla local.`);
  }

  private applySurveyQuestionSuggestions(questions: SurveyQuestion[]) {
    this.surveyQuestionsDraft.set(
      questions.map((question) => ({
        question_text: question.question_text,
        question_type: question.question_type,
        required: question.required,
        optionsText: (question.options ?? []).join('\n'),
        help_text: question.help_text ?? ''
      }))
    );
  }

  removeSurveyQuestion(index: number) {
    const next = this.surveyQuestionsDraft().filter((_, itemIndex) => itemIndex !== index);
    this.surveyQuestionsDraft.set(
      next.length > 0 ? next : [{ question_text: '', question_type: 'long_text', required: true, optionsText: '', help_text: '' }]
    );
  }

  updateSurveyQuestion(index: number, field: keyof SurveyQuestionDraft, value: string | boolean) {
    this.surveyQuestionsDraft.set(
      this.surveyQuestionsDraft().map((question, itemIndex) =>
        itemIndex === index ? { ...question, [field]: value } : question
      )
    );
  }

  saveSurvey() {
    const projectId = this.projectId();
    const value = this.surveyForm.getRawValue();
    const questions = this.surveyQuestionsDraft()
      .map((question, index): SurveyQuestion => ({
        question_text: question.question_text.trim(),
        question_type: question.question_type,
        required: question.required,
        options: question.optionsText
          .split('\n')
          .map((option) => option.trim())
          .filter(Boolean),
        sort_order: index,
        help_text: question.help_text || null
      }))
      .filter((question) => question.question_text.length >= 3);
    if (!projectId || this.surveyForm.invalid || questions.length === 0) {
      this.surveyForm.markAllAsTouched();
      this.error.set('Completa la encuesta y agrega al menos una pregunta valida.');
      return;
    }
    const invalidOptions = questions.find((question) =>
      ['single_choice', 'multiple_choice'].includes(question.question_type) && question.options.length < 2
    );
    if (invalidOptions) {
      this.error.set('Las preguntas de opcion requieren al menos dos opciones, una por linea.');
      return;
    }
    this.setSavingState();
    this.traceabilityService
      .createSurvey(projectId, {
        title: value.title ?? '',
        description: value.description ?? '',
        objective: value.objective || null,
        category: value.category ?? 'survey',
        status: value.status ?? 'draft',
        due_at: value.due_at || null,
        allow_audio: Boolean(value.allow_audio),
        allow_document: Boolean(value.allow_document),
        allow_anonymous_response: Boolean(value.allow_anonymous_response),
        stakeholder_ids: this.selectedSurveyStakeholderIds(),
        questions
      })
      .subscribe({
        next: (response) => {
          this.success.set('Cuestionario creado como sesion de tecnica con link compartible.');
          this.saving.set(false);
          this.surveyForm.reset({
            title: '',
            description: '',
            objective: '',
            category: 'survey',
            allow_audio: false,
            allow_document: false,
            allow_anonymous_response: true,
            due_at: '',
            participants: 0,
            status: 'draft',
            question: ''
          });
          this.selectedSurveyStakeholderIds.set([]);
          this.surveyQuestionsDraft.set([{ question_text: '', question_type: 'long_text', required: true, optionsText: '', help_text: '' }]);
          this.loadSessions(projectId);
          this.loadFlowStatus(projectId);
          this.loadSurveys(projectId);
          this.openSurvey(response.id);
        },
        error: (err) => {
          this.saving.set(false);
          const backendMessage = err?.error?.message;
          const fieldErrors = err?.error?.errors ? JSON.stringify(err.error.errors) : '';
          this.error.set(
            backendMessage
              ? `No se pudo crear la encuesta: ${backendMessage}${fieldErrors ? ` ${fieldErrors}` : ''}`
              : 'No se pudo crear la encuesta.'
          );
        }
      });
  }

  openSurvey(surveyId: number) {
    this.selectedSurveyId.set(surveyId);
    this.traceabilityService.getSurvey(surveyId).subscribe({
      next: (response) => {
        this.selectedSurveyQuestions.set(response.questions ?? []);
        this.selectedSurveyRecipients.set(response.recipients ?? []);
        this.loadSurveyResults(surveyId);
      },
      error: () => {
        this.selectedSurveyQuestions.set([]);
        this.selectedSurveyRecipients.set([]);
      }
    });
  }

  setSurveyStatus(surveyId: number, status: 'draft' | 'active' | 'closed') {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService.updateSurveyStatus(surveyId, status).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set('Estado de encuesta actualizado.');
        this.loadSurveys(projectId);
        this.openSurvey(surveyId);
      },
      error: (err) => this.fail(err, 'No se pudo actualizar la encuesta.')
    });
  }

  surveyShareLink(survey: SurveyForm) {
    return `${window.location.origin}/questionnaires/respond/${survey.share_token}`;
  }

  copySurveyLink(survey: SurveyForm) {
    navigator.clipboard?.writeText(this.surveyShareLink(survey));
    this.success.set('Link de encuesta copiado.');
  }

  selectedSurvey() {
    const id = this.selectedSurveyId();
    return this.surveys().find((survey) => survey.id === id) ?? null;
  }

  saveStakeholder() {
    const projectId = this.projectId();
    if (!projectId || this.stakeholderForm.invalid) {
      this.stakeholderForm.markAllAsTouched();
      return;
    }
    const value = this.stakeholderForm.getRawValue();
    this.setSavingState();
    this.traceabilityService
      .createStakeholder(projectId, {
        name: value.name ?? '',
        role: value.role ?? '',
        type: value.type ?? 'external',
        contact: value.contact || null
      })
      .subscribe({
        next: () => {
          this.success.set('Stakeholder agregado.');
          this.stakeholderForm.reset({ name: '', role: '', type: 'external', contact: '' });
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo agregar el stakeholder.')
      });
  }

  setTechSearchQuery(query: string) {
    this.techSearchQuery.set(query);
  }

  searchTechUsers() {
    const query = this.techSearchQuery().trim();
    if (!query) {
      this.techSearchResults.set([]);
      return;
    }
    this.setSavingState();
    this.usersService.searchUsers('TECH', query).subscribe({
      next: (response) => {
        this.techSearchResults.set(response.users ?? []);
        this.saving.set(false);
      },
      error: (err) => {
        this.fail(err, 'No se pudieron buscar usuarios tecnicos.');
        this.techSearchResults.set([]);
      }
    });
  }

  assignTechMember(userId: number) {
    const projectId = this.projectId();
    if (!projectId) return;
    this.setSavingState();
    this.projectsService.addProjectUser(projectId, userId).subscribe({
      next: () => {
        this.success.set('Tecnico asignado al proyecto.');
        this.techSearchQuery.set('');
        this.techSearchResults.set([]);
        this.loadProjectUsers(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo asignar el tecnico.')
    });
  }

  removeTechMember(userId: number) {
    const projectId = this.projectId();
    if (!projectId) return;
    this.setSavingState();
    this.projectsService.removeProjectUser(projectId, userId).subscribe({
      next: () => {
        this.success.set('Tecnico removido del proyecto.');
        this.loadProjectUsers(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo remover el tecnico.')
    });
  }

  isTechMemberAlreadyAssigned(userId: number): boolean {
    return this.techMembers().some((member) => member.id === userId);
  }

  saveTargetStack() {
    const projectId = this.projectId();
    if (!projectId || this.targetStackForm.invalid) {
      this.error.set('Completa al menos arquitectura, backend, frontend y base de datos del stack objetivo.');
      return;
    }
    const value = this.targetStackForm.getRawValue();
    this.targetStack.set({
      architectureType: value.architectureType || DEFAULT_TARGET_STACK.architectureType,
      backendFramework: value.backendFramework || DEFAULT_TARGET_STACK.backendFramework,
      backendLanguage: value.backendLanguage || DEFAULT_TARGET_STACK.backendLanguage,
      backendOrm: value.backendOrm || '',
      backendDatabase: value.backendDatabase || DEFAULT_TARGET_STACK.backendDatabase,
      backendMigrations: value.backendMigrations || '',
      backendAuth: value.backendAuth || '',
      backendTesting: value.backendTesting || '',
      frontendFramework: value.frontendFramework || DEFAULT_TARGET_STACK.frontendFramework,
      frontendLanguage: value.frontendLanguage || DEFAULT_TARGET_STACK.frontendLanguage,
      frontendUi: value.frontendUi || '',
      frontendRouting: value.frontendRouting || '',
      frontendDataFetching: value.frontendDataFetching || '',
      frontendState: value.frontendState || '',
      frontendTesting: value.frontendTesting || '',
      runMode: value.runMode || '',
      envVars: this.lines(value.envVars),
      seedAdmin: value.seedAdmin || '',
      commands: this.lines(value.commands)
    });
    this.persistImplementationInputs(projectId);
    this.success.set('Stack objetivo guardado para el paquete implementable.');
  }

  saveImplementationContract() {
    const projectId = this.projectId();
    const value = this.contractForm.getRawValue();
    if (!projectId || !value.requirementId) {
      this.error.set('Selecciona un requisito para crear el contrato tecnico.');
      return;
    }
    const persistedUseCase = this.useCaseArtifacts().find((useCase) => useCase.requirement.id === value.requirementId)?.persistedId ?? null;
    const contract: ImplementationContract = {
      requirementId: value.requirementId,
      useCaseId: persistedUseCase,
      screenName: value.screenName || '',
      routePath: value.routePath || '',
      endpointMethod: value.endpointMethod || 'POST',
      endpointPath: value.endpointPath || '',
      requestFields: this.parseFieldSpecs(value.requestFieldsText),
      responseFields: this.parseFieldSpecs(value.responseFieldsText),
      businessRules: this.lines(value.businessRulesText),
      blockingRules: this.lines(value.blockingRulesText),
      stateRules: this.lines(value.stateRulesText),
      requiredVisibleData: this.lines(value.requiredVisibleDataText),
      validations: this.lines(value.validationsText),
      expectedErrors: this.parseExpectedErrors(value.expectedErrorsText),
      permissions: this.lines(value.permissionsText),
      acceptanceChecks: this.lines(value.acceptanceChecksText),
      testCases: this.lines(value.testCasesText),
      screenFields: this.lines(value.screenFieldsText),
      visibleColumns: this.lines(value.visibleColumnsText),
      quickActions: this.lines(value.quickActionsText),
      filters: this.lines(value.filtersText),
      sideEffects: this.lines(value.sideEffectsText),
      uiErrorBehavior: this.lines(value.uiErrorBehaviorText)
    };
    this.implementationContracts.update((contracts) => [
      contract,
      ...contracts.filter((item) => item.requirementId !== contract.requirementId)
    ]);
    this.persistImplementationInputs(projectId);
    this.success.set('Contrato tecnico guardado.');
  }

  editImplementationContract(contract: ImplementationContract) {
    this.contractForm.patchValue({
      requirementId: contract.requirementId,
      screenName: contract.screenName ?? '',
      routePath: contract.routePath ?? '',
      endpointMethod: contract.endpointMethod ?? 'POST',
      endpointPath: contract.endpointPath ?? '',
      requestFieldsText: this.formatFieldSpecs(contract.requestFields),
      responseFieldsText: this.formatFieldSpecs(contract.responseFields),
      businessRulesText: contract.businessRules.join('\n'),
      blockingRulesText: (contract.blockingRules ?? []).join('\n'),
      stateRulesText: (contract.stateRules ?? []).join('\n'),
      requiredVisibleDataText: (contract.requiredVisibleData ?? []).join('\n'),
      validationsText: contract.validations.join('\n'),
      expectedErrorsText: contract.expectedErrors.map((item) => `${item.statusCode} | ${item.condition} | ${item.message}`).join('\n'),
      permissionsText: contract.permissions.join('\n'),
      acceptanceChecksText: contract.acceptanceChecks.join('\n'),
      testCasesText: contract.testCases.join('\n'),
      screenFieldsText: (contract.screenFields ?? []).join('\n'),
      visibleColumnsText: (contract.visibleColumns ?? []).join('\n'),
      quickActionsText: (contract.quickActions ?? []).join('\n'),
      filtersText: (contract.filters ?? []).join('\n'),
      sideEffectsText: (contract.sideEffects ?? []).join('\n'),
      uiErrorBehaviorText: (contract.uiErrorBehavior ?? []).join('\n')
    });
  }

  deleteImplementationContract(requirementId: number) {
    const projectId = this.projectId();
    if (!projectId) return;
    this.implementationContracts.update((contracts) => contracts.filter((contract) => contract.requirementId !== requirementId));
    this.persistImplementationInputs(projectId);
    this.success.set('Contrato tecnico eliminado.');
  }

  saveDataEntity() {
    const projectId = this.projectId();
    const value = this.dataEntityForm.getRawValue();
    if (!projectId || !value.name) {
      this.error.set('Define el nombre de la entidad.');
      return;
    }
    const name = value.name.trim();
    const entity: DataEntitySpec = {
      id: slugify(name),
      name,
      tableName: value.tableName?.trim() || slugify(name).replace(/-/g, '_'),
      description: value.description || '',
      source: value.source || 'manual',
      confidence: value.confidence || 'alta',
      fields: this.parseDataFields(value.fieldsText),
      relationships: this.parseRelationships(value.relationshipsText, name),
      integrityRules: this.lines(value.integrityRulesText)
    };
    this.dataEntities.update((entities) => [entity, ...entities.filter((item) => item.id !== entity.id)]);
    this.dataEntityForm.reset({ source: 'manual', confidence: 'alta' });
    this.persistImplementationInputs(projectId);
    this.success.set('Entidad del modelo de datos guardada.');
  }

  editDataEntity(entity: DataEntitySpec) {
    this.dataEntityForm.patchValue({
      name: entity.name,
      tableName: entity.tableName,
      description: entity.description,
      source: entity.source,
      confidence: entity.confidence,
      fieldsText: entity.fields.map((field) => `${field.name}:${field.type}:${field.required ? 'required' : 'optional'}:${field.unique ? 'unique' : ''}:${field.nullable ? 'nullable' : ''}:${field.defaultValue ?? ''}:${field.example ?? ''}:${field.description ?? ''}`).join('\n'),
      relationshipsText: entity.relationships.map((rel) => `${rel.fromEntity} | ${rel.type} | ${rel.toEntity} | ${rel.foreignKey ?? ''} | ${rel.onDelete ?? ''} | ${rel.description ?? ''}`).join('\n'),
      integrityRulesText: entity.integrityRules.join('\n')
    });
  }

  deleteDataEntity(entityId: string) {
    const projectId = this.projectId();
    if (!projectId) return;
    this.dataEntities.update((entities) => entities.filter((entity) => entity.id !== entityId));
    this.persistImplementationInputs(projectId);
    this.success.set('Entidad eliminada del modelo manual.');
  }

  saveTargetRole() {
    const projectId = this.projectId();
    const value = this.targetRoleForm.getRawValue();
    if (!projectId || !value.name) {
      this.error.set('Define el nombre del rol.');
      return;
    }
    const role: TargetRoleSpec = {
      id: slugify(value.name),
      name: value.name.trim(),
      description: value.description || '',
      userType: value.userType || '',
      permissions: this.lines(value.permissionsText),
      screens: this.lines(value.screensText),
      endpoints: this.lines(value.endpointsText)
    };
    this.targetRoles.update((roles) => [role, ...roles.filter((item) => item.id !== role.id)]);
    this.targetRoleForm.reset();
    this.persistImplementationInputs(projectId);
    this.success.set('Rol objetivo guardado.');
  }

  editTargetRole(role: TargetRoleSpec) {
    this.targetRoleForm.patchValue({
      name: role.name,
      description: role.description,
      userType: role.userType,
      permissionsText: role.permissions.join('\n'),
      screensText: role.screens.join('\n'),
      endpointsText: role.endpoints.join('\n')
    });
  }

  deleteTargetRole(roleId: string) {
    const projectId = this.projectId();
    if (!projectId) return;
    this.targetRoles.update((roles) => roles.filter((role) => role.id !== roleId));
    this.persistImplementationInputs(projectId);
    this.success.set('Rol eliminado.');
  }

  contractForRequirement(requirementId: number) {
    return this.implementationContracts().find((contract) => contract.requirementId === requirementId) ?? null;
  }

  requirementLabel(requirementId: number) {
    const requirement = this.requirements().find((item) => item.id === requirementId);
    return requirement ? `${requirement.code} - ${requirement.description}` : `Requisito ${requirementId}`;
  }

  saveProcess() {
    const projectId = this.projectId();
    if (!projectId || this.processForm.invalid) {
      this.processForm.markAllAsTouched();
      return;
    }
    const value = this.processForm.getRawValue();
    this.setSavingState();
    this.processesService
      .createProcess(projectId, {
        name: value.name ?? '',
        description: value.description || null
      })
      .subscribe({
        next: () => {
          this.success.set('Proceso agregado.');
          this.processForm.reset({ name: '', description: '' });
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo agregar el proceso.')
      });
  }

  saveSubprocess() {
    const projectId = this.projectId();
    if (!projectId || this.subprocessForm.invalid) {
      this.subprocessForm.markAllAsTouched();
      return;
    }
    const value = this.subprocessForm.getRawValue();
    if (!value.process_id) {
      this.subprocessForm.markAllAsTouched();
      return;
    }
    this.setSavingState();
    this.processesService
      .createSubprocess(value.process_id, {
        name: value.name ?? '',
        description: value.description || null
      })
      .subscribe({
        next: () => {
          this.success.set('Subproceso agregado.');
          this.subprocessForm.reset({ process_id: value.process_id, name: '', description: '' });
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo agregar el subproceso.')
      });
  }

  saveProjectContext() {
    const projectId = this.projectId();
    if (!projectId || this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const value = this.projectForm.getRawValue();
    this.setSavingState();
    this.projectsService
      .updateProject(projectId, {
        name: value.name ?? '',
        objective: value.objective || null,
        scope: value.scope || null,
        description: value.description || null,
        start_date: value.start_date || null,
        end_date: value.end_date || null
      })
      .subscribe({
        next: () => {
          this.success.set('Contexto del proyecto actualizado.');
          this.saving.set(false);
          this.loadProject(projectId);
          this.loadFlowStatus(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo actualizar el contexto del proyecto.')
      });
  }

  async saveCapture(module: CaptureModuleKey) {
    const projectId = this.projectId();
    const config = this.techniqueModules.find((item) => item.key === module);
    const form = this.formForCapture(module);
    if (!projectId || !config?.technique || form.invalid) {
      form.markAllAsTouched();
      return;
    }
    if (module === 'tracking' && this.normalizedTransactionSteps().length === 0) {
      this.error.set('Agrega al menos un paso observado para el seguimiento transaccional.');
      return;
    }

    const stakeholderIds = await this.stakeholderIdsForCapture(projectId, module);
    if (stakeholderIds.length === 0 && module !== 'tracking') {
      form.markAllAsTouched();
      return;
    }

    const title = this.captureTitle(module);
    const notes = this.captureNotes(module);
    const metadata = this.captureMetadata(module);
    const processId = module === 'tracking' ? this.trackingForm.getRawValue().process_id ?? null : null;
    const subprocessId = module === 'tracking' ? this.trackingForm.getRawValue().subprocess_id ?? null : null;
    this.setSavingState();
    this.traceabilityService
      .createSession(projectId, {
        title,
        technique: config.technique,
        technique_code: module === 'tracking' ? 'transaction_tracking' : undefined,
        discovery_type: module === 'tracking' ? 'direct' : undefined,
        status: module === 'tracking' ? 'completed' : undefined,
        notes,
        occurred_at: module === 'tracking' && metadata['startedAt'] ? String(metadata['startedAt']) : new Date().toISOString(),
        stakeholder_ids: stakeholderIds,
        process_id: processId,
        subprocess_id: subprocessId,
        metadata
      })
      .subscribe({
        next: (response) => {
          this.success.set(`${config.label} registrado.`);
          if (module === 'interviews') {
            this.persistInterviewEvidences(response.id, notes, projectId).finally(() => this.resetCapture(module));
            return;
          }
          if (module === 'documents') {
            this.persistDocumentEvidences(response.id, notes, projectId).finally(() => this.resetCapture(module));
            return;
          }
          this.resetCapture(module);
          if (notes.trim().length >= 20) {
            this.traceabilityService
              .createSessionEvidence(response.id, { kind: 'note', notes })
              .subscribe({ next: () => this.afterMutation(projectId), error: () => this.afterMutation(projectId) });
            return;
          }
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, `No se pudo registrar ${config.label.toLowerCase()}.`)
      });
  }

  saveFinding() {
    const projectId = this.projectId();
    const value = this.findingForm.getRawValue();
    if (!projectId || this.findingForm.invalid || !value.session_id) {
      this.findingForm.markAllAsTouched();
      return;
    }
    this.setSavingState();
    this.traceabilityService
      .createSessionFinding(value.session_id, {
        category: value.category ?? 'need',
        statement: value.statement ?? ''
      })
      .subscribe({
        next: () => {
          this.success.set('Hallazgo creado.');
          this.findingForm.reset({ session_id: value.session_id, category: 'need', statement: '' });
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo crear el hallazgo.')
      });
  }

  saveRequirement() {
    const projectId = this.projectId();
    const value = this.requirementForm.getRawValue();
    const findingIds = value.finding_ids ?? [];
    if (!projectId || this.requirementForm.invalid || findingIds.length === 0) {
      this.requirementForm.markAllAsTouched();
      return;
    }
    this.setSavingState();
    this.traceabilityService
      .createRequirement(projectId, {
        type: value.type ?? 'functional',
        priority: value.priority ?? 'medium',
        description: value.description ?? '',
        acceptance_criteria: value.acceptance_criteria ?? '',
        finding_ids: findingIds
      })
      .subscribe({
        next: (response) => {
          this.success.set(`Requisito ${response.code} creado.`);
          this.requirementForm.reset({
            type: 'functional',
            priority: 'medium',
            description: '',
            acceptance_criteria: '',
            finding_ids: []
          });
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo crear el requisito.')
      });
  }

  generateAIFindings() {
    this.error.set('La generacion automatica esta desactivada. Documenta los hallazgos manualmente desde Evidencias.');
  }

  generateAIDocumentFindings() {
    this.error.set('La generacion automatica esta desactivada. Registra hallazgos manuales desde el analisis documental.');
  }

  generateAIRequirements() {
    this.error.set('La generacion automatica esta desactivada. Crea requisitos manuales desde hallazgos seleccionados.');
  }

  acceptAIDraftFinding(draft: AIDraftFinding) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService
      .updateAIDraftFinding(projectId, draft.id, {
        status: 'accepted',
        category: draft.category,
        statement: draft.statement
      })
      .subscribe({
        next: () => {
          this.success.set('Borrador aceptado y guardado como hallazgo real.');
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo aceptar el hallazgo.')
      });
  }

  rejectAIDraftFinding(draft: AIDraftFinding) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService.updateAIDraftFinding(projectId, draft.id, { status: 'rejected' }).subscribe({
      next: () => {
        this.success.set('Borrador de hallazgo rechazado.');
        this.afterMutation(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo rechazar el hallazgo.')
    });
  }

  acceptAIDraftRequirement(draft: AIDraftRequirement) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService
      .updateAIDraftRequirement(projectId, draft.id, {
        status: 'accepted',
        type: draft.type,
        priority: draft.priority,
        description: draft.description,
        acceptance_criteria: draft.acceptance_criteria,
        source_finding_ids: draft.source_finding_ids
      })
      .subscribe({
        next: () => {
          this.success.set('Borrador aceptado y guardado como requisito real.');
          this.afterMutation(projectId);
        },
        error: (err) => this.fail(err, 'No se pudo aceptar el requisito.')
      });
  }

  rejectAIDraftRequirement(draft: AIDraftRequirement) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    this.setSavingState();
    this.traceabilityService.updateAIDraftRequirement(projectId, draft.id, { status: 'rejected' }).subscribe({
      next: () => {
        this.success.set('Borrador de requisito rechazado.');
        this.afterMutation(projectId);
      },
      error: (err) => this.fail(err, 'No se pudo rechazar el requisito.')
    });
  }

  // Refresh pulls each slice independently because the workspace can still be useful if one panel fails.
  private refresh(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.loadProject(projectId);
    this.loadProjectUsers(projectId);
    this.loadStakeholders(projectId);
    this.loadProcesses(projectId);
    this.loadSessions(projectId);
    this.loadFindings(projectId);
    this.loadRequirements(projectId);
    this.loadUseCases(projectId);
    this.loadTraceability(projectId);
    this.loadFlowStatus(projectId);
    this.loadAIDrafts(projectId);
    this.loadSurveys(projectId);
    this.loading.set(false);
  }

  // After a save I reload the chain, not just the edited row, because counts and traceability depend on each other.
  private afterMutation(projectId: number) {
    this.saving.set(false);
    this.loadStakeholders(projectId);
    this.loadProcesses(projectId);
    this.loadSessions(projectId);
    this.loadFindings(projectId);
    this.loadRequirements(projectId);
    this.loadUseCases(projectId);
    this.loadTraceability(projectId);
    this.loadFlowStatus(projectId);
    this.loadAIDrafts(projectId);
    this.loadSurveys(projectId);
  }

  private loadProject(projectId: number) {
    this.projectsService.getProject(projectId).subscribe({
      next: (response) => {
        this.project.set(response.project);
        this.projectForm.patchValue({
          name: response.project.name ?? '',
          objective: response.project.objective ?? response.project.description ?? '',
          scope: response.project.scope ?? '',
          description: response.project.description ?? '',
          start_date: response.project.start_date ?? '',
          end_date: response.project.end_date ?? ''
        });
      },
      error: () => this.project.set(null)
    });
  }

  private loadProjectUsers(projectId: number) {
    this.projectsService.getProjectUsers(projectId).subscribe({
      next: (response) => {
        this.techUsers.set(response.techUsers ?? []);
        this.clientUsers.set(response.clientUsers ?? []);
      },
      error: () => {
        this.techUsers.set([]);
        this.clientUsers.set([]);
      }
    });
  }

  private loadStakeholders(projectId: number) {
    this.traceabilityService.getStakeholders(projectId).subscribe({
      next: (response) => this.stakeholders.set(response.stakeholders ?? []),
      error: () => this.stakeholders.set([])
    });
  }

  private loadProcesses(projectId: number) {
    this.processesService.getProcesses(projectId).subscribe({
      next: async (response) => {
        const processes = response.processes ?? [];
        this.processes.set(processes);
        const subprocessGroups = await Promise.all(
          processes.map((process) =>
            firstValueFrom(this.processesService.getSubprocesses(process.id))
              .then((result) => result.subprocesses ?? [])
              .catch(() => [])
          )
        );
        this.subprocesses.set(subprocessGroups.flat());
      },
      error: () => {
        this.processes.set([]);
        this.subprocesses.set([]);
      }
    });
  }

  private loadSessions(projectId: number) {
    this.traceabilityService.getSessions(projectId).subscribe({
      next: (response) => {
        const sessions = response.sessions ?? [];
        this.sessions.set(sessions);
        const firstEvidenceSession = sessions.find((session) => session.evidence_count > 0);
        if (firstEvidenceSession && !this.findingForm.get('session_id')?.value) {
          this.findingForm.patchValue({ session_id: firstEvidenceSession.id });
        }
        for (const session of sessions) {
          this.loadSessionEvidences(session.id);
        }
      },
      error: () => this.sessions.set([])
    });
  }

  private loadSessionEvidences(sessionId: number) {
    this.traceabilityService.getSessionEvidences(sessionId).subscribe({
      next: (response) => {
        this.evidencesBySession.set({
          ...this.evidencesBySession(),
          [sessionId]: response.evidences ?? []
        });
      },
      error: () => {
        this.evidencesBySession.set({
          ...this.evidencesBySession(),
          [sessionId]: []
        });
      }
    });
  }

  private loadFindings(projectId: number) {
    this.traceabilityService.getProjectFindings(projectId).subscribe({
      next: (response) => this.findings.set(response.findings ?? []),
      error: () => this.findings.set([])
    });
  }

  private loadRequirements(projectId: number) {
    this.traceabilityService.getRequirements(projectId).subscribe({
      next: (response) => this.requirements.set(response.requirements ?? []),
      error: () => this.requirements.set([])
    });
  }

  private loadUseCases(projectId: number) {
    this.traceabilityService.getUseCases(projectId).subscribe({
      next: (response) => this.useCases.set(response.use_cases ?? []),
      error: () => this.useCases.set([])
    });
  }

  private loadTraceability(projectId: number) {
    this.traceabilityService.getTraceability(projectId).subscribe({
      next: (response) => this.traceability.set(response.traceability ?? []),
      error: () => this.traceability.set([])
    });
  }

  private loadFlowStatus(projectId: number) {
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => this.flowStatus.set(response.flow_status),
      error: () => this.flowStatus.set(null)
    });
  }

  private loadAIDrafts(projectId: number) {
    this.traceabilityService.getAIDraftFindings(projectId).subscribe({
      next: (response) => this.aiDraftFindings.set(response.drafts ?? []),
      error: () => this.aiDraftFindings.set([])
    });
    this.traceabilityService.getAIDraftRequirements(projectId).subscribe({
      next: (response) => this.aiDraftRequirements.set(response.drafts ?? []),
      error: () => this.aiDraftRequirements.set([])
    });
  }

  private loadSurveys(projectId: number) {
    this.traceabilityService.getSurveys(projectId).subscribe({
      next: (response) => {
        this.surveys.set(response.surveys ?? []);
        const selected = this.selectedSurveyId();
        if (selected && response.surveys?.some((survey) => survey.id === selected)) {
          this.openSurvey(selected);
        }
      },
      error: () => this.surveys.set([])
    });
  }

  private loadSurveyResults(surveyId: number) {
    this.traceabilityService.getSurveyResults(surveyId).subscribe({
      next: (response) => {
        this.surveyResponses.set(response.responses ?? []);
        this.surveyMetrics.set(response.metrics ?? []);
      },
      error: () => {
        this.surveyResponses.set([]);
        this.surveyMetrics.set([]);
      }
    });
  }

  private formForCapture(module: CaptureModuleKey): any {
    const forms = {
      interviews: this.interviewForm,
      surveys: this.surveyForm,
      observations: this.observationForm,
      focus: this.focusForm,
      documents: this.documentForm,
      tracking: this.trackingForm
    };
    return forms[module];
  }

  // Capture modules share the same session/evidence pipeline, so I normalize each form into notes.
  private captureTitle(module: CaptureModuleKey) {
    const form = this.formForCapture(module);
    return String(form.get('title')?.value ?? '').trim();
  }

  private captureNotes(module: CaptureModuleKey) {
    switch (module) {
      case 'interviews': {
        const value = this.interviewForm.getRawValue();
        const interviewer = this.techUsers().find((user) => user.id === value.interviewer_user_id);
        const interviewee = this.resolveIntervieweeLabel();
        return [
          value.objective ? `Objetivo: ${value.objective}` : '',
          value.scheduled_at ? `Fecha/hora: ${value.scheduled_at}` : '',
          value.duration ? `Duracion: ${value.duration}` : '',
          `Entrevistador tecnico: ${interviewer?.name ?? 'No seleccionado'} (${interviewer?.email ?? 'sin correo'})`,
          `Entrevistado: ${interviewee}`,
          `Preguntas y respuestas:\n${value.questions}`,
          value.transcript ? `Transcripcion:\n${value.transcript}` : '',
          value.agreements ? `Acuerdos:\n${value.agreements}` : '',
          value.pains ? `Dolores detectados:\n${value.pains}` : '',
          value.needs ? `Necesidades:\n${value.needs}` : '',
          value.notes ? `Notas: ${value.notes}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'surveys': {
        const value = this.surveyForm.getRawValue();
        return [
          `Descripcion: ${value.description}`,
          `Participantes esperados: ${value.participants ?? 0}`,
          `Estado: ${value.status}`,
          `Pregunta: ${value.question}`
        ].join('\n');
      }
      case 'observations': {
        const value = this.observationForm.getRawValue();
        return [
          value.processName ? `Proceso observado: ${value.processName}` : '',
          value.place ? `Lugar/canal: ${value.place}` : '',
          value.observedActor ? `Actor observado: ${value.observedActor}` : '',
          value.observedAt ? `Fecha/hora: ${value.observedAt}` : '',
          value.context ? `Condiciones/contexto: ${value.context}` : '',
          value.behavior ? `Comportamiento observado: ${value.behavior}` : '',
          value.problem ? `Problema detectado: ${value.problem}` : '',
          value.impact ? `Impacto: ${value.impact}` : '',
          `Nota: ${value.note}`,
          value.keyPoint ? `Punto clave: ${value.keyPoint}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'focus': {
        const value = this.focusForm.getRawValue();
        return [
          `Moderador: ${value.moderator}`,
          value.mediaType ? `Tipo de media: ${value.mediaType}` : '',
          `Objetivo: ${value.objective}`,
          value.participants ? `Participantes:\n${value.participants}` : '',
          value.guideQuestions ? `Preguntas guia:\n${value.guideQuestions}` : '',
          value.agreements ? `Acuerdos:\n${value.agreements}` : '',
          value.disagreements ? `Desacuerdos:\n${value.disagreements}` : '',
          value.detectedNeeds ? `Necesidades detectadas:\n${value.detectedNeeds}` : '',
          value.conclusions ? `Conclusiones: ${value.conclusions}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'documents': {
        const value = this.documentForm.getRawValue();
        return [
          `Tipo: ${value.documentType}`,
          `Fuente: ${value.source}`,
          `Documento analizado: ${value.documentName}`,
          value.version ? `Version: ${value.version}` : '',
          value.documentDate ? `Fecha del documento: ${value.documentDate}` : '',
          value.author ? `Autor/fuente responsable: ${value.author}` : '',
          value.summary ? `Resumen:\n${value.summary}` : '',
          value.businessRules ? `Reglas de negocio encontradas:\n${value.businessRules}` : '',
          value.explicitRequirements ? `Requisitos explicitos:\n${value.explicitRequirements}` : '',
          value.risks ? `Inconsistencias o riesgos:\n${value.risks}` : '',
          value.documentContent ? `Contenido o extracto relevante:\n${value.documentContent}` : '',
          value.findings ? `Hallazgos: ${value.findings}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'tracking': {
        const value = this.trackingForm.getRawValue();
        const process = this.processes().find((item) => item.id === value.process_id);
        const subprocess = this.subprocesses().find((item) => item.id === value.subprocess_id);
        const steps = this.normalizedTransactionSteps();
        return [
          `ID transaccion: ${value.transactionId}`,
          value.transactionType ? `Tipo de transaccion: ${value.transactionType}` : '',
          `Proceso: ${process?.name ?? 'No seleccionado'}`,
          subprocess ? `Subproceso: ${subprocess.name}` : '',
          value.objective ? `Objetivo del seguimiento: ${value.objective}` : '',
          value.realFlowSummary ? `Resumen del flujo real:\n${value.realFlowSummary}` : '',
          steps.length
            ? `Pasos observados:\n${steps.map((step) => `${step.order}. ${step.name} | actor: ${this.trackingActorLabel(step.actorStakeholderId, step.actorRole)} | sistema/canal: ${[step.system, step.channel].filter(Boolean).join(' / ') || 'No especificado'} | accion: ${step.action || 'No especificada'}${step.issue ? ` | problema: ${step.issue}` : ''}`).join('\n')}`
            : 'Pasos observados: pendiente',
          this.transactionProblems().length
            ? `Problemas detectados:\n${this.transactionProblems().map((problem) => `- Paso ${problem.stepOrder}: ${problem.description}`).join('\n')}`
            : '',
          value.totalTime ? `Tiempo total: ${value.totalTime}` : '',
          value.targetTime ? `Tiempo objetivo: ${value.targetTime}` : '',
          value.deviation ? `Desviacion: ${value.deviation}` : '',
          value.metrics ? `Metricas: ${value.metrics}` : ''
        ].filter(Boolean).join('\n');
      }
    }
  }

  private captureMetadata(module: CaptureModuleKey): Record<string, unknown> {
    if (module !== 'tracking') {
      return {};
    }
    const value = this.trackingForm.getRawValue();
    const steps = this.normalizedTransactionSteps();
    return {
      transactionId: value.transactionId,
      transactionType: value.transactionType || null,
      startedAt: value.startedAt || null,
      completedAt: value.completedAt || null,
      finalStatus: value.finalStatus || value.status || null,
      primaryActorId: value.primaryActorId ?? null,
      systemsInvolved: this.splitList(value.systemsInvolved),
      objective: value.objective || null,
      realFlowSummary: value.realFlowSummary || null,
      steps,
      problems: this.transactionProblems(),
      metrics: {
        totalTime: value.totalTime || null,
        targetTime: value.targetTime || null,
        deviation: value.deviation || null,
        reworkCount: Number(value.reworkCount ?? 0),
        manualStepCount: Number(value.manualStepCount ?? 0),
        informalApprovalCount: Number(value.informalApprovalCount ?? 0),
        notes: value.metrics || null
      }
    };
  }

  private normalizedTransactionSteps() {
    return this.transactionSteps()
      .map((step, index) => ({
        order: index + 1,
        name: step.name.trim(),
        actorStakeholderId: step.actorStakeholderId,
        actorRole: step.actorRole.trim(),
        system: step.system.trim(),
        channel: step.channel.trim(),
        input: step.input.trim(),
        action: step.action.trim(),
        output: step.output.trim(),
        duration: step.duration.trim(),
        waitTime: step.waitTime.trim(),
        issue: step.issue.trim(),
        bottleneck: step.bottleneck.trim(),
        handoffTo: step.handoffTo.trim(),
        evidenceRef: step.evidenceRef.trim(),
        notes: step.notes.trim()
      }))
      .filter((step) => step.name || step.action || step.issue || step.actorStakeholderId || step.actorRole);
  }

  private transactionProblems() {
    return this.normalizedTransactionSteps()
      .filter((step) => step.issue)
      .map((step) => ({
        stepOrder: step.order,
        description: step.issue,
        severity: 'medium',
        impact: step.notes || null,
        evidenceRef: step.evidenceRef || null
      }));
  }

  private isTrackingSession(session: Session) {
    return session.technique_code === 'transaction_tracking'
      || /seguimiento|transaccional|transaction/i.test(`${session.technique} ${session.title}`);
  }

  private metadataText(session: Session, key: string) {
    const value = session.metadata?.[key];
    return value === null || value === undefined ? '' : String(value);
  }

  private metadataNumber(session: Session, key: string) {
    const value = session.metadata?.[key];
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private trackingActorLabel(stakeholderId: number | null | undefined, role: string) {
    const stakeholder = stakeholderId ? this.stakeholders().find((item) => item.id === stakeholderId) : null;
    return stakeholder ? `${stakeholder.name} (${stakeholder.role})` : role || 'No especificado';
  }

  private splitList(value: string | null | undefined) {
    return String(value ?? '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private resetCapture(module: CaptureModuleKey) {
    this.formForCapture(module).reset();
    this.interviewForm.patchValue({
      interviewer_user_id: null,
      interviewed_stakeholder_id: null,
      questions: '',
      transcript: '',
      agreements: '',
      pains: '',
      needs: '',
      notes: ''
    });
    this.selectedInterviewFiles.set([]);
    this.selectedDocumentFiles.set([]);
    this.surveyForm.patchValue({ participants: 0, status: 'draft' });
    if (module === 'tracking') {
      this.trackingForm.reset({
        title: '',
        process_id: null,
        subprocess_id: null,
        transactionId: '',
        transactionType: '',
        startedAt: '',
        completedAt: '',
        finalStatus: '',
        primaryActorId: null,
        systemsInvolved: '',
        objective: '',
        realFlowSummary: '',
        totalTime: '',
        targetTime: '',
        deviation: '',
        reworkCount: 0,
        manualStepCount: 0,
        informalApprovalCount: 0,
        status: '',
        metrics: ''
      });
      this.transactionSteps.set([{
        name: '',
        actorStakeholderId: null,
        actorRole: '',
        system: '',
        channel: '',
        input: '',
        action: '',
        output: '',
        duration: '',
        waitTime: '',
        issue: '',
        bottleneck: '',
        handoffTo: '',
        evidenceRef: '',
        notes: ''
      }]);
    }
  }

  private async stakeholderIdsForCapture(projectId: number, module: CaptureModuleKey): Promise<number[]> {
    if (module === 'interviews') {
      return this.resolveInterviewStakeholderIds(projectId);
    }
    if (module === 'tracking') {
      const actorId = this.trackingForm.getRawValue().primaryActorId;
      return actorId ? [actorId] : [];
    }

    const defaultStakeholder = this.stakeholders()[0];
    if (!defaultStakeholder) {
      this.error.set('Agrega al menos un stakeholder antes de registrar tecnicas de recopilacion.');
      return [];
    }
    return [defaultStakeholder.id];
  }

  private async resolveInterviewStakeholderIds(projectId: number): Promise<number[]> {
    const value = this.interviewForm.getRawValue();
    if (!value.interviewer_user_id) {
      this.error.set('Selecciona un entrevistador tecnico del proyecto.');
      return [];
    }
    if (!value.interviewed_stakeholder_id) {
      this.error.set('Selecciona un stakeholder entrevistado.');
      return [];
    }
    return [value.interviewed_stakeholder_id];
  }

  private resolveIntervieweeLabel() {
    const value = this.interviewForm.getRawValue();
    const stakeholder = this.stakeholders().find((item) => item.id === value.interviewed_stakeholder_id);
    return stakeholder ? `${stakeholder.name} (${stakeholder.role})` : 'Stakeholder no seleccionado';
  }

  // File and transcript evidence are saved after the session so traceability has a parent to attach to.
  private async persistInterviewEvidences(sessionId: number, notes: string, projectId: number) {
    const transcript = this.interviewForm.getRawValue().transcript?.trim() ?? '';
    const files = this.selectedInterviewFiles();
    const tasks = [];
    if (notes.trim().length >= 20) {
      tasks.push(firstValueFrom(this.traceabilityService.createSessionEvidence(sessionId, { kind: 'note', notes })));
    }
    if (transcript.length >= 20) {
      tasks.push(firstValueFrom(this.traceabilityService.createSessionEvidence(sessionId, { kind: 'transcript', notes: transcript })));
    }
    if (files.length > 0) {
      tasks.push(firstValueFrom(this.traceabilityService.uploadSessionEvidenceFiles(sessionId, files, 'Archivo o audio de entrevista')));
    }

    try {
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      this.afterMutation(projectId);
    } catch {
      this.error.set('La entrevista se guardo, pero alguna evidencia no pudo subirse.');
      this.afterMutation(projectId);
    }
  }

  // Document analysis can start as pasted text, uploaded files, or both.
  private async persistDocumentEvidences(sessionId: number, notes: string, projectId: number) {
    const files = this.selectedDocumentFiles();
    const tasks = [];
    if (notes.trim().length >= 20) {
      tasks.push(firstValueFrom(this.traceabilityService.createSessionEvidence(sessionId, { kind: 'note', notes })));
    }
    if (files.length > 0) {
      tasks.push(firstValueFrom(this.traceabilityService.uploadSessionEvidenceFiles(sessionId, files, 'Documento analizado manualmente')));
    }

    try {
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      this.afterMutation(projectId);
    } catch {
      this.error.set('El analisis se guardo, pero algun documento no pudo subirse.');
      this.afterMutation(projectId);
    }
  }

  private requirementSourceFindings(requirement: Requirement) {
    const findingIds = requirement.finding_ids ?? [];
    return this.findings().filter((finding) => findingIds.includes(finding.id));
  }

  private summarizeRequirementAction(description: string) {
    const normalized = description.trim().replace(/\s+/g, ' ');
    if (normalized.length <= 90) {
      return normalized.toLowerCase();
    }
    return `${normalized.slice(0, 87).toLowerCase()}...`;
  }

  private suggestEndpoints(requirement: Requirement) {
    const base = requirement.code.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (requirement.type === 'non_functional') {
      return [`GET /health/${base}`, `GET /metrics/${base}`];
    }
    return [`GET /${base}`, `POST /${base}`, `PATCH /${base}/:id`];
  }

  private suggestTests(requirement: Requirement) {
    return [
      `Validar criterio de aceptacion de ${requirement.code}`,
      `Verificar manejo de datos invalidos para ${requirement.code}`,
      `Confirmar que la trazabilidad conserva hallazgos fuente`
    ];
  }

  // These helpers are lightweight guesses, not a replacement for real modeling done by the analyst.
  private toPascalCase(value: string) {
    const cleaned = removeAccents(value)
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return 'Entidad';
    }
    return words
      .slice(0, 3)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private traceStatus(
    evidenceLabel: string,
    useCase: DerivedUseCase | null,
    spec: DerivedSpec | null,
    task: DerivedAgentTask | null
  ): { status: TraceAuditRow['status']; label: string } {
    if (evidenceLabel === 'Sin evidencia') {
      return { status: 'missing-evidence', label: 'Falta evidencia' };
    }
    if (!useCase) {
      return { status: 'missing-requirement', label: 'Falta historia/caso' };
    }
    if (!spec) {
      return { status: 'missing-spec', label: 'Falta spec' };
    }
    if (!task) {
      return { status: 'missing-task', label: 'Falta tarea' };
    }
    return { status: 'complete', label: 'Completo con derivados' };
  }

  private domainText(useCases: DerivedUseCase[]) {
    return [
      this.project()?.name,
      this.project()?.description,
      this.project()?.objective,
      ...useCases.flatMap((useCase) => [
        useCase.requirement.description,
        useCase.acceptanceCriteria,
        ...useCase.sourceFindings.map((finding) => finding.statement)
      ]),
      ...this.sessions().map((session) => `${session.title} ${session.technique} ${session.notes ?? ''}`),
      ...Object.values(this.evidencesBySession()).flat().map((evidence) => `${evidence.file_name ?? ''} ${evidence.notes ?? ''}`)
    ].filter(Boolean).join(' ');
  }

  private inferDomainEntities(useCases: DerivedUseCase[]): DomainEntity[] {
    const text = removeAccents(this.domainText(useCases)).toLowerCase();
    const catalog: Array<{ terms: string[]; entity: DomainEntity }> = [
      { terms: ['paciente', 'pacientes'], entity: { name: 'Paciente', attributes: ['id', 'nombre', 'telefono', 'correo'], operations: ['registrar()', 'actualizarDatos()'] } },
      { terms: ['cita', 'citas', 'agenda', 'agendar'], entity: { name: 'Cita', attributes: ['id', 'fecha', 'hora', 'estado'], operations: ['agendar()', 'cancelar()', 'reprogramar()'] } },
      { terms: ['medico', 'doctor', 'doctora', 'medica'], entity: { name: 'Medico', attributes: ['id', 'nombre', 'especialidad'], operations: ['consultarDisponibilidad()'] } },
      { terms: ['consultorio', 'consultorios'], entity: { name: 'Consultorio', attributes: ['id', 'numero', 'ubicacion'], operations: ['reservar()'] } },
      { terms: ['recepcionista', 'recepcion'], entity: { name: 'Recepcionista', attributes: ['id', 'nombre', 'turno'], operations: ['gestionarCita()'] } },
      { terms: ['horario', 'disponibilidad', 'slot'], entity: { name: 'Disponibilidad', attributes: ['id', 'fecha', 'horaInicio', 'horaFin'], operations: ['validar()'] } },
      { terms: ['usuario', 'usuarios', 'cliente', 'clientes'], entity: { name: 'Usuario', attributes: ['id', 'nombre', 'rol'], operations: ['autenticar()'] } },
      { terms: ['cotizacion', 'cotizaciones'], entity: { name: 'Cotizacion', attributes: ['id', 'folio', 'total', 'estado'], operations: ['calcular()', 'aprobar()'] } },
      { terms: ['producto', 'productos'], entity: { name: 'Producto', attributes: ['id', 'nombre', 'precio'], operations: ['actualizarPrecio()'] } },
      { terms: ['orden', 'pedido'], entity: { name: 'Orden', attributes: ['id', 'fecha', 'estado'], operations: ['crear()', 'cancelar()'] } },
      { terms: ['pago', 'pagos'], entity: { name: 'Pago', attributes: ['id', 'monto', 'metodo'], operations: ['procesar()'] } }
    ];

    const entities = catalog
      .filter((item) => item.terms.some((term) => text.includes(term)))
      .map((item) => item.entity);

    if (entities.length >= 3) {
      return entities.slice(0, 8);
    }

    const fallbackNames = Array.from(
      new Set(
        useCases
          .flatMap((useCase) => useCase.requirement.description.match(/\b[A-ZÃÃ‰ÃÃ“ÃšÃ‘][a-zÃ¡Ã©Ã­Ã³ÃºÃ±]{3,}\b/g) ?? [])
          .map((value) => this.toPascalCase(value))
          .filter((value) => !['Sistema', 'Usuario', 'Requisito'].includes(value))
      )
    );

    return [
      ...entities,
      ...fallbackNames.map((name) => ({
        name,
        attributes: ['id', 'nombre', 'estado'],
        operations: ['crear()', 'actualizar()']
      }))
    ].slice(0, 6);
  }

  private domainActors(useCases: DerivedUseCase[]) {
    const actors = Array.from(
      new Set([
        ...this.stakeholders().map((stakeholder) => stakeholder.role || stakeholder.name),
        ...useCases.map((useCase) => useCase.actor)
      ].filter(Boolean).map((actor) => this.toPascalCase(actor)))
    );
    return actors.length > 0 ? actors.slice(0, 3) : ['Usuario'];
  }

  private buildDerivedDiagramArtifacts(): DerivedDiagram[] {
    const projectId = this.projectId();
    const useCases = this.useCaseArtifacts();
    if (useCases.length === 0) {
      return [];
    }

    const baseDiagrams: DerivedDiagram[] = [
      {
        id: 'derived-use-case-overview',
        title: 'Use case architecture map',
        kind: 'use_case',
        source: 'requirements-and-use-cases',
        sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
        sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
        sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
        diagram: { ...this.buildUseCaseDiagram(projectId, useCases), id: 'derived-use-case-overview', title: 'Use case architecture map' }
      },
      {
        id: 'derived-class-model',
        title: 'Class model',
        kind: 'class',
        source: 'data-model-and-requirements',
        sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
        sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
        sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
        diagram: { ...this.buildClassDiagram(projectId, useCases), id: 'derived-class-model', title: 'Class model' }
      },
      {
        id: 'derived-package-map',
        title: 'Package map',
        kind: 'package',
        source: 'target-stack-and-requirements',
        sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
        sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
        sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
        diagram: { ...this.buildPackageDiagram(projectId, useCases), id: 'derived-package-map', title: 'Package map' }
      },
      {
        id: 'derived-component-map',
        title: 'Component map',
        kind: 'component',
        source: 'technical-contracts-and-stack',
        sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
        sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
        sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
        diagram: { ...this.buildComponentDiagram(projectId, useCases), id: 'derived-component-map', title: 'Component map' }
      }
    ];

    return [...baseDiagrams, ...this.buildDerivedSequenceArtifacts(projectId, useCases)];
  }

  private buildDerivedSequenceArtifacts(projectId: number | null, useCases: DerivedUseCase[]): DerivedDiagram[] {
    const trackingSessions = this.trackingSessions();
    if (trackingSessions.length === 0) {
      return [
        {
          id: 'derived-sequence-generic',
          title: 'Generic sequence flow',
          kind: 'sequence',
          source: 'requirements',
          sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
          sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
          sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
          diagram: { ...this.buildSequenceDiagram(projectId, useCases), id: 'derived-sequence-generic', title: 'Generic sequence flow' }
        }
      ];
    }

    return trackingSessions.map((session) => {
      const diagram = this.buildTrackingSequenceDiagram(projectId, useCases, session);
      return {
        id: `derived-sequence-session-${session.id}`,
        title: diagram.title,
        kind: 'sequence' as const,
        source: session.title,
        sourceRequirementIds: diagram.sourceRequirementIds,
        sourceUseCaseIds: diagram.sourceUseCaseIds,
        sourceSpecIds: diagram.sourceSpecIds,
        diagram
      };
    });
  }

  private buildTrackingSequenceDiagram(projectId: number | null, useCases: DerivedUseCase[], session: Session): DiagramModel {
    const steps = this.trackingSteps(session);
    const processName = this.trackingProcessName(session);
    const subprocessName = this.trackingSubprocessName(session);
    const participantMap = new Map<string, { id: string; label: string }>();

    const registerParticipant = (label: string) => {
      const normalized = label.trim() || 'Operational system';
      if (!participantMap.has(normalized)) {
        participantMap.set(normalized, {
          id: `participant-${participantMap.size + 1}`,
          label: normalized
        });
      }
      return participantMap.get(normalized)!;
    };

    steps.forEach((step) => {
      registerParticipant(this.trackingActorLabel(step.actorStakeholderId, step.actorRole ?? '') || 'Operational actor');
      registerParticipant([step.system, step.channel].filter(Boolean).join(' / ') || 'Operational system');
    });

    if (participantMap.size === 0) {
      registerParticipant(this.trackingPrimaryActor(session));
      registerParticipant(this.trackingSystems(session));
    }

    const participants = [...participantMap.values()];
    const nodes: DiagramNode[] = participants.map((participant, index) => ({
      id: participant.id,
      type: 'lifeline',
      label: participant.label,
      x: 60 + index * 190,
      y: 40,
      width: 150,
      height: Math.max(420, 120 + Math.max(steps.length, 3) * 54)
    }));

    const edges: DiagramEdge[] = [];
    steps.forEach((step, index) => {
      const actor = registerParticipant(this.trackingActorLabel(step.actorStakeholderId, step.actorRole ?? '') || 'Operational actor');
      const target = registerParticipant([step.system, step.channel].filter(Boolean).join(' / ') || 'Operational system');
      edges.push({
        id: `tracking-seq-edge-${session.id}-${index + 1}`,
        sourceNodeId: actor.id,
        targetNodeId: target.id,
        type: 'message',
        label: `${step.order ?? index + 1}. ${step.name || step.action || 'Operational step'}`
      });
      if (step.output || step.issue) {
        edges.push({
          id: `tracking-seq-result-${session.id}-${index + 1}`,
          sourceNodeId: target.id,
          targetNodeId: actor.id,
          type: 'dependency',
          label: step.issue ? `Issue: ${step.issue}` : `Output: ${step.output}`
        });
      }
    });

    return this.diagramModel(
      projectId,
      'sequence',
      `Sequence - ${processName}${subprocessName ? ` / ${subprocessName}` : ''}`,
      nodes,
      edges,
      useCases,
      `derived-sequence-session-${session.id}`
    );
  }

  private async layoutDiagram(diagram: DiagramModel): Promise<DiagramModel> {
    if (diagram.type === 'sequence' || diagram.nodes.length < 2) {
      return diagram;
    }

    const boundaryNode = diagram.nodes.find((node) => node.type === 'boundary') ?? null;
    const layoutNodes = diagram.nodes.filter((node) => node.type !== 'boundary');
    const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
    const elk = new ELK();
    const result = await elk.layout({
      id: diagram.id,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': diagram.type === 'class' ? 'DOWN' : 'RIGHT',
        'elk.layered.spacing.nodeNodeBetweenLayers': '90',
        'elk.spacing.nodeNode': '70',
        'elk.padding': '[top=40,left=40,bottom=40,right=40]'
      },
      children: layoutNodes.map((node) => ({
        id: node.id,
        width: node.width,
        height: node.height
      })),
      edges: diagram.edges
        .filter((edge) => layoutNodeIds.has(edge.sourceNodeId) && layoutNodeIds.has(edge.targetNodeId))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.sourceNodeId],
          targets: [edge.targetNodeId]
        }))
    });

    const positionedChildren = new Map((result.children ?? []).map((node) => [node.id, node]));
    const positionedNodes = layoutNodes.map((node) => {
      const positioned = positionedChildren.get(node.id);
      return positioned
        ? {
            ...node,
            x: Math.round(positioned.x ?? node.x),
            y: Math.round(positioned.y ?? node.y)
          }
        : node;
    });

    const nextNodes = boundaryNode
      ? [...positionedNodes, this.fitBoundaryNode(boundaryNode, positionedNodes)]
      : positionedNodes;

    return { ...diagram, nodes: nextNodes };
  }

  private fitBoundaryNode(boundaryNode: DiagramNode, nodes: DiagramNode[]): DiagramNode {
    if (nodes.length === 0) {
      return boundaryNode;
    }
    const minX = Math.min(...nodes.map((node) => node.x)) - 70;
    const minY = Math.min(...nodes.map((node) => node.y)) - 40;
    const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 40;
    const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + 40;
    return {
      ...boundaryNode,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private buildUseCaseDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    const actors = this.domainActors(useCases);
    const boundaryId = 'system-boundary';
    nodes.push({
      id: boundaryId,
      type: 'boundary',
      label: this.project()?.name ?? 'Sistema',
      x: 210,
      y: 35,
      width: 520,
      height: Math.max(320, useCases.length * 105),
    });
    actors.forEach((actor, index) => {
      nodes.push({ id: `actor-${index}`, type: 'actor', label: actor, x: index === 0 ? 45 : 780, y: 95 + index * 130, width: 110, height: 68 });
    });
    useCases.forEach((useCase, index) => {
      const rowY = 85 + index * 100;
      const actorId = `actor-${index % actors.length}`;
      const useCaseId = `usecase-${useCase.requirement.id}`;
      const requirementId = `requirement-${useCase.requirement.id}`;
      const specId = `spec-${useCase.requirement.id}`;
      nodes.push(
        {
          id: useCaseId,
          type: 'use_case',
          label: useCase.action,
          x: 300,
          y: rowY - 5,
          width: 240,
          height: 78,
          requirementId: useCase.requirement.id
        },
        {
          id: requirementId,
          type: 'requirement',
          label: useCase.requirement.code,
          x: 520,
          y: rowY,
          width: 130,
          height: 68,
          requirementId: useCase.requirement.id
        },
        {
          id: specId,
          type: 'spec',
          label: `Spec ${useCase.requirement.code}`,
          x: 720,
          y: rowY,
          width: 150,
          height: 68,
          requirementId: useCase.requirement.id,
          specId: `spec-${useCase.requirement.id}`
        }
      );
      edges.push(
        { id: `edge-a-uc-${useCase.requirement.id}`, sourceNodeId: actorId, targetNodeId: useCaseId, type: 'association' },
        { id: `edge-uc-r-${useCase.requirement.id}`, sourceNodeId: useCaseId, targetNodeId: requirementId, type: 'dependency', label: 'deriva' },
        { id: `edge-r-s-${useCase.requirement.id}`, sourceNodeId: requirementId, targetNodeId: specId, type: 'dependency', label: 'especifica' }
      );
    });

    return {
      id: `diagram-${Date.now()}`,
      projectId,
      type: 'use_case',
      title: 'Diagrama editable de casos de uso',
      sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
      sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
      sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
      nodes,
      edges,
      derived: true
    };
  }

  private buildClassDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const manualEntities = this.dataEntities();
    const entities = manualEntities.length > 0
      ? manualEntities.map((entity) => ({
          name: this.toPascalCase(entity.name),
          attributes: entity.fields.length > 0
            ? entity.fields.map((field) => `${field.name}: ${field.type}${field.required ? '' : '?'}`)
            : ['id: number'],
          operations: entity.integrityRules.slice(0, 3).map((rule) => `validar ${rule.slice(0, 18)}...()`)
        }))
      : this.inferDomainEntities(useCases);
    const nodes: DiagramNode[] = entities.map((entity, index) => ({
      id: `class-${entity.name}`,
      type: 'class' as const,
      label: `${entity.name}\n${entity.attributes.map((attr) => `- ${attr}`).join('\n')}\n${entity.operations.map((op) => `+ ${op}`).join('\n')}`,
      x: 70 + (index % 3) * 280,
      y: 70 + Math.floor(index / 3) * 180,
      width: 210,
      height: 145,
      ...this.diagramNodeVisualDefaults('class')
    }));
    const manualRelationships = manualEntities.flatMap((entity) => entity.relationships);
    const edges: DiagramEdge[] = manualRelationships.length > 0
      ? manualRelationships
          .map((relationship, index) => {
            const sourceNodeId = `class-${this.toPascalCase(relationship.fromEntity)}`;
            const targetNodeId = `class-${this.toPascalCase(relationship.toEntity)}`;
            if (!nodes.some((node) => node.id === sourceNodeId) || !nodes.some((node) => node.id === targetNodeId)) {
              return null;
            }
            return {
              id: `class-edge-${index}`,
              sourceNodeId,
              targetNodeId,
              type: relationship.type === 'one-to-many' ? 'aggregation' : 'association',
              label: relationship.foreignKey || relationship.type,
              notes: relationship.description
            } as DiagramEdge;
          })
          .filter((edge): edge is DiagramEdge => Boolean(edge))
      : entities.slice(1).map((entity, index) => ({
          id: `class-edge-${index}`,
          sourceNodeId: `class-${entities[0].name}`,
          targetNodeId: `class-${entity.name}`,
          type: 'association' as const,
          label: index === 0 ? 'gestiona' : 'relaciona'
        }));
    return this.diagramModel(projectId, 'class', 'Diagrama UML de clases', nodes, edges, useCases);
  }

  private buildSequenceDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const firstTrackingSession = this.trackingSessions()[0];
    if (firstTrackingSession) {
      return this.buildTrackingSequenceDiagram(projectId, useCases, firstTrackingSession);
    }
    const first = useCases[0];
    const entities = this.inferDomainEntities(useCases);
    const mainEntity = entities[0]?.name ?? 'Entidad';
    const contract = this.implementationContracts().find((item) => item.requirementId === first?.requirement.id) ?? this.implementationContracts()[0];
    const action = first?.action ?? 'ejecutar caso de uso';
    const nodes: DiagramNode[] = [
      { id: 'seq-actor', type: 'lifeline', label: first?.actor ?? 'Stakeholder', x: 50, y: 40, width: 130, height: 430 },
      { id: 'seq-ui', type: 'lifeline', label: contract?.screenName || `Pantalla ${mainEntity}`, x: 250, y: 40, width: 150, height: 430 },
      { id: 'seq-service', type: 'lifeline', label: `${mainEntity}Service`, x: 470, y: 40, width: 150, height: 430 },
      { id: 'seq-repo', type: 'lifeline', label: this.targetStack().backendDatabase || `${mainEntity}Repository`, x: 700, y: 40, width: 150, height: 430 }
    ];
    const edges: DiagramEdge[] = [
      { id: 'seq-edge-1', sourceNodeId: 'seq-actor', targetNodeId: 'seq-ui', type: 'association', label: `1. ${action}` },
      { id: 'seq-edge-2', sourceNodeId: 'seq-ui', targetNodeId: 'seq-service', type: 'message', label: contract?.endpointPath ? `2. ${contract.endpointMethod ?? 'GET'} ${contract.endpointPath}` : `2. validar ${mainEntity}` },
      { id: 'seq-edge-3', sourceNodeId: 'seq-service', targetNodeId: 'seq-repo', type: 'data_flow', label: `3. guardar/consultar ${mainEntity}` },
      { id: 'seq-edge-4', sourceNodeId: 'seq-repo', targetNodeId: 'seq-service', type: 'dependency', label: '4. resultado' },
      { id: 'seq-edge-5', sourceNodeId: 'seq-service', targetNodeId: 'seq-ui', type: 'dependency', label: '5. confirmar operacion' }
    ];
    return this.diagramModel(projectId, 'sequence', 'Diagrama de secuencia', nodes, edges, useCases);
  }

  private buildPackageDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const entities = this.inferDomainEntities(useCases);
    const domainName = entities[0]?.name ?? this.toPascalCase(this.project()?.name ?? 'Dominio');
    const nodes: DiagramNode[] = [
      { id: 'pkg-ui', type: 'package', label: `UI\nPantallas ${domainName}`, x: 80, y: 80, width: 190, height: 110 },
      { id: 'pkg-app', type: 'package', label: `Aplicacion\nCasos de uso\nServicios`, x: 360, y: 80, width: 210, height: 110 },
      { id: 'pkg-domain', type: 'package', label: `Dominio ${domainName}\n${entities.slice(0, 3).map((e) => e.name).join('\n')}`, x: 640, y: 80, width: 210, height: 130 },
      { id: 'pkg-infra', type: 'package', label: 'Infraestructura\nRepositorios\nBase de datos', x: 220, y: 310, width: 220, height: 120 },
      { id: 'pkg-security', type: 'package', label: 'Seguridad\nRoles\nPermisos', x: 600, y: 310, width: 190, height: 110 }
    ];
    const edges: DiagramEdge[] = [
      { id: 'pkg-edge-1', sourceNodeId: 'pkg-ui', targetNodeId: 'pkg-app', type: 'dependency', label: 'usa' },
      { id: 'pkg-edge-2', sourceNodeId: 'pkg-app', targetNodeId: 'pkg-domain', type: 'dependency', label: 'coordina' },
      { id: 'pkg-edge-3', sourceNodeId: 'pkg-app', targetNodeId: 'pkg-infra', type: 'dependency', label: 'persiste' },
      { id: 'pkg-edge-4', sourceNodeId: 'pkg-app', targetNodeId: 'pkg-security', type: 'dependency', label: 'autoriza' }
    ];
    return this.diagramModel(projectId, 'package', 'Diagrama de paquetes', nodes, edges, useCases);
  }

  private buildComponentDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const entities = this.inferDomainEntities(useCases);
    const mainEntity = entities[0]?.name ?? 'Dominio';
    const stack = this.targetStack();
    const firstContract = this.implementationContracts()[0];
    const nodes: DiagramNode[] = [
      { id: 'cmp-ui', type: 'screen', label: `${stack.frontendFramework || mainEntity}\n${firstContract?.screenName || 'UI'}`, x: 70, y: 90, width: 190, height: 82, ...this.diagramNodeVisualDefaults('screen') },
      { id: 'cmp-api', type: 'api', label: `${stack.backendFramework || mainEntity} API\n${firstContract?.endpointPath || 'REST'}`, x: 340, y: 90, width: 190, height: 82, ...this.diagramNodeVisualDefaults('api') },
      { id: 'cmp-service', type: 'service', label: `${mainEntity}Service`, x: 610, y: 90, width: 190, height: 82, ...this.diagramNodeVisualDefaults('service') },
      { id: 'cmp-db', type: 'database', label: stack.backendDatabase || `${mainEntity} DB`, x: 610, y: 300, width: 170, height: 90, ...this.diagramNodeVisualDefaults('database') },
      { id: 'cmp-auth', type: 'component', label: stack.backendAuth || 'Auth/Roles', x: 340, y: 300, width: 170, height: 82, ...this.diagramNodeVisualDefaults('component') }
    ];
    const edges: DiagramEdge[] = [
      { id: 'cmp-edge-1', sourceNodeId: 'cmp-ui', targetNodeId: 'cmp-api', type: 'data_flow', label: firstContract?.endpointMethod || 'REST' },
      { id: 'cmp-edge-2', sourceNodeId: 'cmp-api', targetNodeId: 'cmp-service', type: 'dependency', label: 'orquesta' },
      { id: 'cmp-edge-3', sourceNodeId: 'cmp-service', targetNodeId: 'cmp-db', type: 'data_flow', label: stack.backendOrm || 'persistencia' },
      { id: 'cmp-edge-4', sourceNodeId: 'cmp-api', targetNodeId: 'cmp-auth', type: 'dependency', label: 'autorizacion' }
    ];
    return this.diagramModel(projectId, 'component', 'Diagrama de componentes', nodes, edges, useCases);
  }

  private diagramModel(
    projectId: number | null,
    type: DiagramKind,
    title: string,
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    useCases: DerivedUseCase[],
    id = `diagram-${type}-${Date.now()}`
  ): DiagramModel {
    return {
      id,
      projectId,
      type,
      title,
      sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
      sourceUseCaseIds: useCases.map((useCase) => useCase.persistedId).filter((id): id is number => typeof id === 'number'),
      sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
      nodes,
      edges,
      derived: true
    };
  }

  private ensureDiagram(): DiagramModel {
    const current = this.diagram();
    if (current) {
      return current;
    }
    const empty: DiagramModel = {
      id: `diagram-${Date.now()}`,
      projectId: this.projectId(),
      type: 'free',
      title: 'Diagrama libre',
      sourceRequirementIds: [],
      sourceUseCaseIds: [],
      sourceSpecIds: [],
      nodes: [],
      edges: [],
      derived: false
    };
    this.diagram.set(empty);
    return empty;
  }

  private loadSavedDiagrams(projectId: number) {
    try {
      const raw = localStorage.getItem(this.diagramStorageKey(projectId));
      const parsed = raw ? JSON.parse(raw) : [];
      const entries = Array.isArray(parsed)
        ? parsed
            .map((item) => this.normalizeSavedDiagramEntry(item))
            .filter((item): item is SavedDiagramEntry => Boolean(item))
        : [];
      this.savedDiagrams.set(entries);
    } catch {
      this.savedDiagrams.set([]);
    }
  }

  private persistSavedDiagrams(projectId: number, diagrams: SavedDiagramEntry[]) {
    this.savedDiagrams.set(diagrams);
    localStorage.setItem(this.diagramStorageKey(projectId), JSON.stringify(diagrams));
  }

  private diagramStorageKey(projectId: number) {
    return `graficacion:project:${projectId}:diagrams`;
  }

  private loadImplementationInputs(projectId: number) {
    this.projectsService.getProjectImplementationInputs(projectId).subscribe({
      next: (response) => {
        const hasBackendData =
          Object.keys(response.targetStack ?? {}).length > 0 ||
          response.implementationContracts.length > 0 ||
          response.dataEntities.length > 0 ||
          response.targetRoles.length > 0;
        if (!hasBackendData && this.restoreImplementationInputsFromLocalBackup(projectId)) {
          this.persistImplementationInputs(projectId);
          return;
        }
        this.applyImplementationInputs({
          targetStack: response.targetStack,
          implementationContracts: response.implementationContracts,
          dataEntities: response.dataEntities,
          targetRoles: response.targetRoles
        });
      },
      error: () => {
        if (!this.restoreImplementationInputsFromLocalBackup(projectId)) {
          this.applyImplementationInputs({});
        }
      }
    });
  }

  private persistImplementationInputs(projectId: number) {
    const payload = {
      targetStack: this.targetStack() as unknown as Record<string, unknown>,
      implementationContracts: this.implementationContracts() as unknown as Array<Record<string, unknown>>,
      dataEntities: this.dataEntities() as unknown as Array<Record<string, unknown>>,
      targetRoles: this.targetRoles() as unknown as Array<Record<string, unknown>>
    };
    localStorage.setItem(this.implementationInputsStorageKey(projectId), JSON.stringify(payload));
    this.projectsService.saveProjectImplementationInputs(projectId, payload).subscribe({
      next: (response) => {
        this.applyImplementationInputs({
          targetStack: response.targetStack,
          implementationContracts: response.implementationContracts,
          dataEntities: response.dataEntities,
          targetRoles: response.targetRoles
        });
      },
      error: () => {
        this.error.set('No se pudo sincronizar la documentacion implementable con el backend. Se conservo respaldo local.');
      }
    });
  }

  private applyImplementationInputs(value: Partial<{
    targetStack: Record<string, unknown>;
    implementationContracts: Array<Record<string, unknown>>;
    dataEntities: Array<Record<string, unknown>>;
    targetRoles: Array<Record<string, unknown>>;
  }>) {
    const stack = { ...DEFAULT_TARGET_STACK, ...(value.targetStack ?? {}) } as TargetStack;
    this.targetStack.set(stack);
    this.targetStackForm.patchValue({
      ...stack,
      envVars: Array.isArray(stack.envVars) ? stack.envVars.join('\n') : '',
      commands: Array.isArray(stack.commands) ? stack.commands.join('\n') : ''
    });
    this.implementationContracts.set(Array.isArray(value.implementationContracts) ? value.implementationContracts as unknown as ImplementationContract[] : []);
    this.dataEntities.set(Array.isArray(value.dataEntities) ? value.dataEntities as unknown as DataEntitySpec[] : []);
    this.targetRoles.set(Array.isArray(value.targetRoles) ? value.targetRoles as unknown as TargetRoleSpec[] : []);
  }

  private restoreImplementationInputsFromLocalBackup(projectId: number) {
    try {
      const raw = localStorage.getItem(this.implementationInputsStorageKey(projectId));
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) {
        return false;
      }
      this.applyImplementationInputs(parsed);
      return true;
    } catch {
      return false;
    }
  }

  private implementationInputsStorageKey(projectId: number) {
    return `graficacion:project:${projectId}:implementation-inputs`;
  }

  private loadManagedProjectFiles(projectId: number) {
    try {
      const raw = localStorage.getItem(this.projectFilesStorageKey(projectId));
      const parsed = raw ? JSON.parse(raw) : {};
      const files = Array.isArray(parsed.files)
        ? parsed.files
            .map((file: unknown) => this.normalizeProjectFile(file))
            .filter((file: ProjectArtifactFile | null): file is ProjectArtifactFile => Boolean(file))
        : [];
      const deleted = Array.isArray(parsed.deletedGeneratedIds) ? parsed.deletedGeneratedIds.map(String) : [];
      this.managedProjectFiles.set(files);
      this.deletedGeneratedProjectFileIds.set(deleted);
      this.selectedProjectFileId.set(null);
      this.projectFileDraft.set(null);
    } catch {
      this.managedProjectFiles.set([]);
      this.deletedGeneratedProjectFileIds.set([]);
    }
  }

  private persistManagedProjectFiles(projectId: number, files: ProjectArtifactFile[], deletedGeneratedIds: string[]) {
    this.managedProjectFiles.set(files);
    this.deletedGeneratedProjectFileIds.set(deletedGeneratedIds);
    localStorage.setItem(this.projectFilesStorageKey(projectId), JSON.stringify({ files, deletedGeneratedIds }));
  }

  private upsertManagedProjectFile(projectId: number, file: ProjectArtifactFile) {
    const files = this.managedProjectFiles();
    const next = files.some((item) => item.id === file.id)
      ? files.map((item) => (item.id === file.id ? file : item))
      : [...files, file];
    const deleted = this.deletedGeneratedProjectFileIds().filter((id) => id !== file.id);
    this.persistManagedProjectFiles(projectId, next, deleted);
  }

  private projectFilesStorageKey(projectId: number) {
    return `graficacion:project:${projectId}:files`;
  }

  private projectFilePath(file: ProjectArtifactFile) {
    return file.folder ? `${file.folder}/${file.name}` : file.name;
  }

  private cleanProjectFolderPart(value: string) {
    return value.trim().length > 0 ? cleanProjectFilePart(value) : '';
  }

  private isImageProjectFileName(fileName: string) {
    return /\.(png|jpe?g|webp|svg)$/i.test(fileName);
  }

  private isDesignIdeaFileName(fileName: string) {
    return /\.(md|markdown|txt|png|jpe?g|webp|svg)$/i.test(fileName);
  }

  private isDesignInputFile(file: ProjectArtifactFile) {
    return file.folder.startsWith('07_DESIGN_IDEAS') || file.kind.toLowerCase().includes('diseno') || this.isImageProjectFileName(file.name);
  }

  private readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private normalizeProjectFile(value: unknown): ProjectArtifactFile | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const file = value as Partial<ProjectArtifactFile>;
    if (!file.id || !file.name) {
      return null;
    }
    const sources: ProjectArtifactFile['source'][] = ['generated', 'edited', 'custom', 'imported'];
    const encoding: ProjectArtifactFile['encoding'] = file.encoding === 'data_url' ? 'data_url' : 'text';
    return {
      id: String(file.id),
      folder: typeof file.folder === 'string' && file.folder.trim() === '' ? '' : cleanProjectFilePart(file.folder || '04-importados'),
      name: cleanProjectFilePart(file.name),
      kind: String(file.kind || 'Archivo'),
      content: String(file.content ?? ''),
      encoding,
      mime_type: file.mime_type ? String(file.mime_type) : undefined,
      size_bytes: Number.isFinite(Number(file.size_bytes)) ? Number(file.size_bytes) : undefined,
      source: sources.includes(file.source as ProjectArtifactFile['source']) ? (file.source as ProjectArtifactFile['source']) : 'imported',
      updatedAt: file.updatedAt ? String(file.updatedAt) : undefined
    };
  }

  private normalizeSavedDiagramEntry(value: unknown): SavedDiagramEntry | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const entry = value as Partial<SavedDiagramEntry>;
    try {
      const diagram = this.normalizeImportedDiagram(entry.diagram);
      return {
        id: String(entry.id || diagram.id),
        title: String(entry.title || diagram.title || 'Diagrama'),
        type: diagram.type,
        updatedAt: String(entry.updatedAt || new Date().toISOString()),
        diagram
      };
    } catch {
      return null;
    }
  }

  private normalizeImportedDiagram(value: unknown): DiagramModel {
    if (!value || typeof value !== 'object') {
      throw new Error('Invalid diagram');
    }
    const diagram = value as Partial<DiagramModel>;
    if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
      throw new Error('Invalid diagram');
    }
    const allowedTypes: DiagramKind[] = ['use_case', 'class', 'sequence', 'package', 'component', 'free'];
    const type = allowedTypes.includes(diagram.type as DiagramKind) ? (diagram.type as DiagramKind) : 'free';
    return {
      id: String(diagram.id || `diagram-${Date.now()}`),
      projectId: this.projectId(),
      type,
      title: String(diagram.title || `Diagrama ${type}`),
      sourceRequirementIds: Array.isArray(diagram.sourceRequirementIds) ? diagram.sourceRequirementIds.map(Number).filter(Number.isFinite) : [],
      sourceUseCaseIds: Array.isArray(diagram.sourceUseCaseIds) ? diagram.sourceUseCaseIds.map(Number).filter(Number.isFinite) : [],
      sourceSpecIds: Array.isArray(diagram.sourceSpecIds) ? diagram.sourceSpecIds.map(String) : [],
      nodes: diagram.nodes.map((node, index) => this.normalizeDiagramNode(node, index)),
      edges: diagram.edges.map((edge, index) => this.normalizeDiagramEdge(edge, index)).filter((edge): edge is DiagramEdge => Boolean(edge)),
      derived: Boolean(diagram.derived)
    };
  }

  private normalizeDiagramNode(value: unknown, index: number): DiagramNode {
    const node = value as Partial<DiagramNode>;
    const allowedTypes: DiagramNodeType[] = [
      'actor',
      'use_case',
      'class',
      'package',
      'component',
      'process',
      'decision',
      'database',
      'service',
      'screen',
      'api',
      'queue',
      'requirement',
      'spec',
      'note',
      'lifeline',
      'boundary'
    ];
    const type = allowedTypes.includes(node.type as DiagramNodeType) ? (node.type as DiagramNodeType) : 'note';
    return {
      id: String(node.id || `node-${Date.now()}-${index}`),
      type,
      label: String(node.label || this.defaultDiagramNodeLabel(type, index + 1)),
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : 80 + index * 24,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80 + index * 24,
      width: Number.isFinite(Number(node.width)) ? Number(node.width) : 150,
      height: Number.isFinite(Number(node.height)) ? Number(node.height) : 68,
      fill: node.fill ? String(node.fill) : this.diagramNodeVisualDefaults(type).fill,
      stroke: node.stroke ? String(node.stroke) : this.diagramNodeVisualDefaults(type).stroke,
      textColor: node.textColor ? String(node.textColor) : this.diagramNodeVisualDefaults(type).textColor,
      layer: node.layer ? String(node.layer) : undefined,
      notes: node.notes ? String(node.notes) : undefined,
      requirementId: Number.isFinite(Number(node.requirementId)) ? Number(node.requirementId) : undefined,
      specId: node.specId ? String(node.specId) : undefined
    };
  }

  private normalizeDiagramEdge(value: unknown, index: number): DiagramEdge | null {
    const edge = value as Partial<DiagramEdge>;
    if (!edge.sourceNodeId || !edge.targetNodeId) {
      return null;
    }
    const allowedTypes: DiagramEdgeType[] = ['association', 'include', 'extend', 'dependency', 'inheritance', 'composition', 'aggregation', 'message', 'data_flow'];
    return {
      id: String(edge.id || `edge-${Date.now()}-${index}`),
      sourceNodeId: String(edge.sourceNodeId),
      targetNodeId: String(edge.targetNodeId),
      type: allowedTypes.includes(edge.type as DiagramEdgeType) ? (edge.type as DiagramEdgeType) : 'association',
      label: edge.label ? String(edge.label) : '',
      notes: edge.notes ? String(edge.notes) : undefined
    };
  }

  private resizedDiagramNode(
    node: DiagramNode,
    resize: {
      handle: DiagramResizeHandle;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
      startNodeX: number;
      startNodeY: number;
    },
    pointerX: number,
    pointerY: number
  ): DiagramNode {
    const minimum = this.diagramNodeMinimumSize(node.type);
    const deltaX = pointerX - resize.startX;
    const deltaY = pointerY - resize.startY;
    let x = resize.startNodeX;
    let y = resize.startNodeY;
    let width = resize.startWidth;
    let height = resize.startHeight;

    if (resize.handle.includes('e')) {
      width = resize.startWidth + deltaX;
    }
    if (resize.handle.includes('s')) {
      height = resize.startHeight + deltaY;
    }
    if (resize.handle.includes('w')) {
      width = resize.startWidth - deltaX;
      x = resize.startNodeX + deltaX;
    }
    if (resize.handle.includes('n')) {
      height = resize.startHeight - deltaY;
      y = resize.startNodeY + deltaY;
    }

    if (width < minimum.width) {
      if (resize.handle.includes('w')) {
        x = resize.startNodeX + resize.startWidth - minimum.width;
      }
      width = minimum.width;
    }
    if (height < minimum.height) {
      if (resize.handle.includes('n')) {
        y = resize.startNodeY + resize.startHeight - minimum.height;
      }
      height = minimum.height;
    }

    return {
      ...node,
      x: Math.max(8, Math.round(x)),
      y: Math.max(8, Math.round(y)),
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  private diagramNodeMinimumSize(type: DiagramNodeType) {
    if (type === 'lifeline') {
      return { width: 96, height: 180 };
    }
    if (type === 'class') {
      return { width: 150, height: 110 };
    }
    if (type === 'use_case') {
      return { width: 130, height: 58 };
    }
    if (type === 'decision') {
      return { width: 84, height: 84 };
    }
    if (type === 'database') {
      return { width: 110, height: 78 };
    }
    return { width: 96, height: 56 };
  }

  private diagramNodeVisualDefaults(type: DiagramNodeType): Pick<DiagramNode, 'fill' | 'stroke' | 'textColor'> {
    const defaults: Record<DiagramNodeType, Pick<DiagramNode, 'fill' | 'stroke' | 'textColor'>> = {
      actor: { fill: '#F8FAFC', stroke: '#475569', textColor: '#0F172A' },
      use_case: { fill: '#EFF6FF', stroke: '#2563EB', textColor: '#0F172A' },
      class: { fill: '#FFFFFF', stroke: '#334155', textColor: '#0F172A' },
      package: { fill: '#F8FAFC', stroke: '#64748B', textColor: '#0F172A' },
      component: { fill: '#F1F5F9', stroke: '#0F172A', textColor: '#0F172A' },
      process: { fill: '#ECFDF5', stroke: '#059669', textColor: '#064E3B' },
      decision: { fill: '#FEF3C7', stroke: '#D97706', textColor: '#78350F' },
      database: { fill: '#EEF2FF', stroke: '#4F46E5', textColor: '#1E1B4B' },
      service: { fill: '#F0FDFA', stroke: '#0F766E', textColor: '#134E4A' },
      screen: { fill: '#FDF2F8', stroke: '#DB2777', textColor: '#831843' },
      api: { fill: '#F5F3FF', stroke: '#7C3AED', textColor: '#2E1065' },
      queue: { fill: '#FFF7ED', stroke: '#EA580C', textColor: '#7C2D12' },
      requirement: { fill: '#FFFBEB', stroke: '#F59E0B', textColor: '#78350F' },
      spec: { fill: '#ECFDF5', stroke: '#10B981', textColor: '#064E3B' },
      note: { fill: '#FFF7ED', stroke: '#FED7AA', textColor: '#7C2D12' },
      lifeline: { fill: '#F8FAFC', stroke: '#60A5FA', textColor: '#0F172A' },
      boundary: { fill: '#FFFFFF', stroke: '#CBD5E1', textColor: '#475569' }
    };
    return defaults[type];
  }

  private lines(value: string | null | undefined) {
    return String(value ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private parseFieldSpecs(value: string | null | undefined): FieldSpec[] {
    return this.lines(value).map((line) => {
      const [name = '', type = 'string', required = 'required', description = '', example = '', enumValues = ''] = line.split(':').map((part) => part.trim());
      const fieldType = FIELD_TYPES.includes(type as FieldSpecType) ? type as FieldSpecType : 'string';
      return {
        name: name || 'campo',
        type: fieldType,
        required: !/optional|false|no/i.test(required),
        description,
        example,
        enumValues: enumValues ? enumValues.split(',').map((item) => item.trim()).filter(Boolean) : undefined
      };
    });
  }

  private formatFieldSpecs(fields: FieldSpec[]) {
    return fields.map((field) => `${field.name}:${field.type}:${field.required ? 'required' : 'optional'}:${field.description ?? ''}:${field.example ?? ''}:${field.enumValues?.join(',') ?? ''}`).join('\n');
  }

  private parseExpectedErrors(value: string | null | undefined): ExpectedError[] {
    return this.lines(value).map((line) => {
      const [status = '400', condition = '', message = 'Error esperado'] = line.split('|').map((part) => part.trim());
      const statusCode = Number(status);
      const allowed: ExpectedError['statusCode'][] = [400, 401, 403, 404, 409, 422, 500];
      return {
        statusCode: allowed.includes(statusCode as ExpectedError['statusCode']) ? statusCode as ExpectedError['statusCode'] : 400,
        condition: condition || 'Condicion no especificada',
        message
      };
    });
  }

  private parseDataFields(value: string | null | undefined): DataFieldSpec[] {
    return this.lines(value).map((line) => {
      const [name = '', type = 'string', required = 'required', unique = '', nullable = '', defaultValue = '', example = '', description = ''] = line.split(':').map((part) => part.trim());
      return {
        name: name || 'campo',
        type: FIELD_TYPES.includes(type as FieldSpecType) ? type as FieldSpecType : 'string',
        required: !/optional|false|no/i.test(required),
        unique: /unique|si|true/i.test(unique),
        nullable: /nullable|si|true/i.test(nullable),
        defaultValue,
        example,
        description
      };
    });
  }

  private parseRelationships(value: string | null | undefined, fallbackEntity: string): DataRelationshipSpec[] {
    return this.lines(value).map((line) => {
      const [fromEntity = fallbackEntity, type = 'many-to-one', toEntity = '', foreignKey = '', onDelete = '', description = ''] = line.split('|').map((part) => part.trim());
      const allowed: DataRelationshipSpec['type'][] = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
      return {
        fromEntity: fromEntity || fallbackEntity,
        type: allowed.includes(type as DataRelationshipSpec['type']) ? type as DataRelationshipSpec['type'] : 'many-to-one',
        toEntity: toEntity || 'Entidad relacionada',
        foreignKey,
        onDelete,
        description
      };
    });
  }

  private buildDrawioXml(diagram: DiagramModel) {
    const cells = [
      '<mxCell id="0" />',
      '<mxCell id="1" parent="0" />',
      ...diagram.nodes.map((node) => this.drawioNodeCell(node)),
      ...diagram.edges.map((edge) => this.drawioEdgeCell(edge))
    ].join('');
    const model = `<mxGraphModel dx="960" dy="560" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root>${cells}</root></mxGraphModel>`;
    return `<mxfile host="Specora" modified="${new Date().toISOString()}" agent="Specora drawio-lite" version="24.0.0" type="device"><diagram id="${this.xmlEscape(diagram.id)}" name="${this.xmlEscape(diagram.title)}">${model}</diagram></mxfile>`;
  }

  private drawioNodeCell(node: DiagramNode) {
    const style = this.drawioNodeStyle(node);
    const value = this.xmlEscape([node.label, node.notes ? `Notas: ${node.notes}` : ''].filter(Boolean).join('\n'));
    return `<mxCell id="${this.xmlEscape(node.id)}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${Math.round(node.width)}" height="${Math.round(node.height)}" as="geometry" /></mxCell>`;
  }

  private drawioEdgeCell(edge: DiagramEdge) {
    const style = this.drawioEdgeStyle(edge.type);
    const value = this.xmlEscape([edge.label, edge.notes].filter(Boolean).join('\n'));
    return `<mxCell id="${this.xmlEscape(edge.id)}" value="${value}" style="${style}" edge="1" parent="1" source="${this.xmlEscape(edge.sourceNodeId)}" target="${this.xmlEscape(edge.targetNodeId)}"><mxGeometry relative="1" as="geometry" /></mxCell>`;
  }

  private drawioNodeStyle(node: DiagramNode) {
    const fill = (node.fill || this.diagramNodeVisualDefaults(node.type).fill || '#ffffff').replace('#', '');
    const stroke = (node.stroke || this.diagramNodeVisualDefaults(node.type).stroke || '#0f172a').replace('#', '');
    const font = (node.textColor || this.diagramNodeVisualDefaults(node.type).textColor || '#0f172a').replace('#', '');
    const base = `whiteSpace=wrap;html=1;fillColor=#${fill};strokeColor=#${stroke};fontColor=#${font};`;
    const styles: Record<DiagramNodeType, string> = {
      actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;',
      use_case: 'ellipse;',
      class: 'swimlane;childLayout=stackLayout;horizontal=1;startSize=28;',
      package: 'shape=folder;tabWidth=60;tabHeight=20;',
      component: 'shape=component;',
      process: 'rounded=0;',
      decision: 'rhombus;',
      database: 'shape=cylinder3d;boundedLbl=1;backgroundOutline=1;size=15;',
      service: 'shape=cloud;',
      screen: 'shape=mxgraph.mockup.containers.browserWindow;mainText=;',
      api: 'rounded=1;arcSize=8;',
      queue: 'shape=process;',
      requirement: 'shape=note;size=16;',
      spec: 'shape=document;',
      note: 'shape=note;size=16;',
      lifeline: 'shape=umlLifeline;participant=umlLifeline;',
      boundary: 'rounded=0;dashed=1;fillColor=none;'
    };
    return `${base}${styles[node.type]}`;
  }

  private drawioEdgeStyle(type: DiagramEdgeType) {
    const styles: Record<DiagramEdgeType, string> = {
      association: 'endArrow=block;html=1;rounded=0;',
      include: 'endArrow=open;html=1;dashed=1;',
      extend: 'endArrow=open;html=1;dashed=1;',
      dependency: 'endArrow=open;html=1;dashed=1;',
      inheritance: 'endArrow=block;endFill=0;html=1;',
      composition: 'endArrow=diamondThin;endFill=1;html=1;',
      aggregation: 'endArrow=diamondThin;endFill=0;html=1;',
      message: 'endArrow=block;html=1;',
      data_flow: 'endArrow=classic;html=1;dashed=1;'
    };
    return styles[type];
  }

  private xmlEscape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private downloadText(fileName: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    this.downloadBlob(fileName, blob);
  }

  private downloadBlob(fileName: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private defaultDiagramNodeLabel(type: DiagramNodeType, count: number) {
    const labels: Record<DiagramNodeType, string> = {
      actor: `Actor ${count}`,
      use_case: `Caso de uso ${count}`,
      class: `Clase ${count}`,
      package: `Paquete ${count}`,
      component: `Componente ${count}`,
      process: `Proceso ${count}`,
      decision: `Decision ${count}`,
      database: `Base de datos ${count}`,
      service: `Servicio ${count}`,
      screen: `Pantalla ${count}`,
      api: `API ${count}`,
      queue: `Cola ${count}`,
      requirement: `REQ-${count}`,
      spec: `Spec ${count}`,
      note: `Nota ${count}`,
      lifeline: `Participante ${count}`,
      boundary: `Sistema ${count}`
    };
    return labels[type];
  }

  private completeDiagramConnection(targetNodeId: string) {
    const sourceNodeId = this.connectSourceNodeId();
    const current = this.diagram();
    if (!sourceNodeId || !current || sourceNodeId === targetNodeId) {
      return;
    }
    const exists = current.edges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId);
    if (!exists) {
      this.diagram.set({
        ...current,
        edges: [
          ...current.edges,
          {
            id: `edge-${Date.now()}`,
            sourceNodeId,
            targetNodeId,
            type: 'association',
            label: ''
          }
        ]
      });
    }
    this.diagramMode.set('select');
    this.connectSourceNodeId.set(null);
    this.selectedDiagramNodeId.set(targetNodeId);
  }

  private diagramPoint(event: PointerEvent) {
    const svg = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : (event.currentTarget as Element).closest('svg');
    const rect = svg?.getBoundingClientRect();
    const viewBox = svg?.viewBox.baseVal;
    const scaleX = rect && viewBox?.width ? viewBox.width / rect.width : 1;
    const scaleY = rect && viewBox?.height ? viewBox.height / rect.height : 1;
    const zoom = this.diagramZoom();
    return {
      x: ((event.clientX - (rect?.left ?? 0)) * scaleX + (viewBox?.x ?? 0) - this.diagramPanX()) / zoom,
      y: ((event.clientY - (rect?.top ?? 0)) * scaleY + (viewBox?.y ?? 0) - this.diagramPanY()) / zoom
    };
  }

  private setSavingState() {
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  private fail(err: { error?: { message?: string } }, fallback: string) {
    this.saving.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }
}
