import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProcessesService, type Process } from '../../services/processes.service';
import { ProjectsService, type Project, type ProjectUser } from '../../services/projects.service';
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
  type TraceabilityItem
} from '../../services/traceability.service';

type ModuleKey =
  | 'summary'
  | 'context'
  | 'stakeholders'
  | 'processes'
  | 'techniques'
  | 'evidences'
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'documents'
  | 'tracking'
  | 'findings'
  | 'requirements'
  | 'useCases'
  | 'specs'
  | 'modeling'
  | 'agent'
  | 'traceability'
  | 'ai';

type CaptureModuleKey =
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'documents'
  | 'tracking';

type TraceViewKey = 'chain' | 'matrix' | 'risks';
type DiagramKind = 'use_case' | 'class' | 'sequence' | 'package' | 'component' | 'free';
type DiagramNodeType =
  | 'actor'
  | 'use_case'
  | 'class'
  | 'package'
  | 'component'
  | 'requirement'
  | 'spec'
  | 'note'
  | 'lifeline'
  | 'boundary';
type DiagramEdgeType = 'association' | 'include' | 'extend' | 'dependency' | 'inheritance';
type DiagramEditorMode = 'select' | 'connect';

type WorkspaceModule = {
  key: ModuleKey;
  label: string;
  icon: string;
  tone: string;
  technique?: string;
};

type NavigationGroup = {
  label: string;
  items: WorkspaceModule[];
};

type DerivedUseCase = {
  id: string;
  title: string;
  requirement: Requirement;
  actor: string;
  action: string;
  benefit: string;
  acceptanceCriteria: string;
  sourceFindings: Finding[];
};

type DerivedSpec = {
  id: string;
  title: string;
  useCase: DerivedUseCase;
  markdown: string;
  endpoints: string[];
  tests: string[];
};

type DerivedAgentTask = {
  id: string;
  title: string;
  spec: DerivedSpec;
  files: string[];
  prompt: string;
};

type DerivedDiagram = {
  id: string;
  title: string;
  kind: string;
  source: string;
  mermaid: string;
};

type DiagramNode = {
  id: string;
  type: DiagramNodeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  requirementId?: number;
  specId?: string;
};

type DiagramEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: DiagramEdgeType;
  label?: string;
};

type DiagramModel = {
  id: string;
  projectId: number | null;
  type: DiagramKind;
  title: string;
  sourceRequirementIds: number[];
  sourceSpecIds: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  derived: boolean;
};

type DomainEntity = {
  name: string;
  attributes: string[];
  operations: string[];
};

type TraceAuditRow = {
  id: string;
  stakeholder: string;
  technique: string;
  evidence: string;
  finding: string;
  requirement: Requirement | TraceabilityItem;
  useCase: DerivedUseCase | null;
  spec: DerivedSpec | null;
  diagram: DerivedDiagram | null;
  task: DerivedAgentTask | null;
  status: 'complete' | 'missing-evidence' | 'missing-finding' | 'missing-requirement' | 'missing-spec' | 'missing-task';
  statusLabel: string;
  source: 'backend' | 'derived';
};

@Component({
  selector: 'app-project-workspace',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './project-workspace.html',
  styleUrl: './project-workspace.css'
})
export class ProjectWorkspace {
  private readonly fb = inject(FormBuilder);

  readonly modules: WorkspaceModule[] = [
    { key: 'summary', label: 'Resumen', icon: 'dashboard', tone: 'blue' },
    { key: 'context', label: 'Contexto del Proyecto', icon: 'article', tone: 'blue' },
    { key: 'stakeholders', label: 'Stakeholders', icon: 'group', tone: 'cyan' },
    { key: 'processes', label: 'Procesos', icon: 'account_tree', tone: 'emerald' },
    { key: 'techniques', label: 'Tecnicas', icon: 'psychology_alt', tone: 'blue' },
    { key: 'evidences', label: 'Evidencias', icon: 'folder_open', tone: 'amber' },
    { key: 'findings', label: 'Hallazgos', icon: 'search', tone: 'slate' },
    { key: 'requirements', label: 'Requisitos', icon: 'fact_check', tone: 'violet' },
    { key: 'useCases', label: 'Historias / Casos', icon: 'menu_book', tone: 'indigo' },
    { key: 'specs', label: 'Specs', icon: 'description', tone: 'blue' },
    { key: 'modeling', label: 'Modelado', icon: 'schema', tone: 'cyan' },
    { key: 'agent', label: 'Agente / Implementacion', icon: 'terminal', tone: 'emerald' },
    { key: 'traceability', label: 'Trazabilidad', icon: 'hub', tone: 'purple' },
    { key: 'ai', label: 'IA', icon: 'auto_awesome', tone: 'indigo' }
  ];

  readonly techniqueModules: Array<WorkspaceModule & { key: CaptureModuleKey; technique: string }> = [
    { key: 'interviews', label: 'Entrevistas', icon: 'chat_bubble', tone: 'blue', technique: 'Entrevista' },
    { key: 'surveys', label: 'Encuestas', icon: 'assignment', tone: 'green', technique: 'Encuesta' },
    { key: 'observations', label: 'Observaciones', icon: 'visibility', tone: 'orange', technique: 'Observacion' },
    { key: 'focus', label: 'Focus Groups', icon: 'groups', tone: 'pink', technique: 'Focus Group' },
    { key: 'documents', label: 'Documentos', icon: 'folder_open', tone: 'amber', technique: 'Documento' },
    { key: 'tracking', label: 'Seguimiento', icon: 'trending_up', tone: 'red', technique: 'Seguimiento Transaccional' }
  ];

  readonly navigationGroups: NavigationGroup[] = [
    {
      label: 'Foundation',
      items: this.modules.filter((module) => ['summary', 'context', 'stakeholders', 'processes'].includes(module.key))
    },
    {
      label: 'Discovery',
      items: this.modules.filter((module) => ['techniques', 'evidences'].includes(module.key))
    },
    {
      label: 'Analysis',
      items: this.modules.filter((module) => ['findings', 'requirements'].includes(module.key))
    },
    {
      label: 'Specification',
      items: this.modules.filter((module) => ['useCases', 'specs', 'modeling', 'agent'].includes(module.key))
    },
    {
      label: 'Assurance',
      items: this.modules.filter((module) => ['traceability', 'ai'].includes(module.key))
    }
  ];

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
  readonly draggingNode = signal<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  readonly selectedInterviewFiles = signal<File[]>([]);
  readonly darkMode = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly stakeholders = signal<Stakeholder[]>([]);
  readonly techUsers = signal<ProjectUser[]>([]);
  readonly clientUsers = signal<ProjectUser[]>([]);
  readonly processes = signal<Process[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly evidencesBySession = signal<Record<number, Evidence[]>>({});
  readonly findings = signal<Finding[]>([]);
  readonly requirements = signal<Requirement[]>([]);
  readonly traceability = signal<TraceabilityItem[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly aiDraftFindings = signal<AIDraftFinding[]>([]);
  readonly aiDraftRequirements = signal<AIDraftRequirement[]>([]);

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

  readonly interviewForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    interviewer_user_id: [null as number | null, [Validators.required]],
    interviewed_stakeholder_id: [null as number | null],
    questions: ['', [Validators.required, Validators.minLength(12)]],
    transcript: [''],
    notes: ['']
  });

  readonly surveyForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(8)]],
    participants: [0, [Validators.min(0)]],
    status: ['draft' as 'draft' | 'active' | 'closed'],
    question: ['', [Validators.required, Validators.minLength(4)]]
  });

  readonly observationForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    note: ['', [Validators.required, Validators.minLength(20)]],
    keyPoint: ['']
  });

  readonly focusForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    moderator: ['', [Validators.required, Validators.minLength(2)]],
    mediaType: [''],
    objective: ['', [Validators.required, Validators.minLength(12)]],
    conclusions: ['']
  });

  readonly documentForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    documentType: ['', [Validators.required, Validators.minLength(2)]],
    source: ['', [Validators.required, Validators.minLength(2)]],
    documentName: ['', [Validators.required, Validators.minLength(3)]],
    findings: ['']
  });

  readonly trackingForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    transactionId: ['', [Validators.required, Validators.minLength(3)]],
    processName: ['', [Validators.required, Validators.minLength(3)]],
    stepName: ['', [Validators.required, Validators.minLength(3)]],
    duration: [''],
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

  readonly captureModules = computed(() => this.techniqueModules);

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

  readonly useCaseArtifacts = computed<DerivedUseCase[]>(() =>
    this.requirements().map((requirement) => {
      const sourceFindings = this.requirementSourceFindings(requirement);
      const actor = sourceFindings[0]?.session_technique === 'Entrevista'
        ? 'stakeholder participante'
        : 'usuario del proceso';
      return {
        id: `uc-${requirement.id}`,
        title: `${requirement.code} - Caso de uso derivado`,
        requirement,
        actor,
        action: this.summarizeRequirementAction(requirement.description),
        benefit: 'mantener el requisito trazable, verificable y listo para implementacion',
        acceptanceCriteria: requirement.acceptance_criteria,
        sourceFindings
      };
    })
  );

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

  readonly diagramArtifacts = computed<DerivedDiagram[]>(() =>
    this.useCaseArtifacts().map((useCase) => ({
      id: `diagram-${useCase.requirement.id}`,
      title: `Caso de uso ${useCase.requirement.code}`,
      kind: 'use-case',
      source: useCase.requirement.code,
      mermaid: [
        'flowchart LR',
        `  actor["${this.escapeDiagramText(useCase.actor)}"]`,
        `  usecase((" ${this.escapeDiagramText(useCase.action)} "))`,
        `  req["${useCase.requirement.code}"]`,
        '  actor --> usecase',
        '  usecase --> req'
      ].join('\n')
    }))
  );

  readonly agentTasks = computed<DerivedAgentTask[]>(() =>
    this.specArtifacts().map((spec) => ({
      id: `task-${spec.useCase.requirement.id}`,
      title: `Implementar ${spec.useCase.requirement.code}`,
      spec,
      files: ['frontend: componente/vista relacionada', 'backend: ruta/servicio si aplica', 'tests: pruebas de aceptacion'],
      prompt: [
        'Contexto',
        `Proyecto: ${this.project()?.name ?? 'Proyecto'}`,
        `Spec fuente: ${spec.title}`,
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
        'Restricciones',
        'No romper rutas existentes. Mantener trazabilidad con el requisito fuente.'
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
      action: 'Revisar agente',
      module: 'agent' as ModuleKey
    }
  ]);

  readonly projectReady = computed(() => {
    const project = this.project();
    return Boolean(project?.name && (project.objective || project.description) && this.stakeholders().length > 0);
  });

  readonly recommendedAction = computed(() => {
    if (!this.projectReady()) {
      return { module: 'context' as ModuleKey, label: 'Completar contexto del proyecto' };
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
    return { module: 'traceability' as ModuleKey, label: 'Validar cadena de trazabilidad' };
  });

  readonly pipelineSteps = computed(() => [
    { label: 'Contexto', complete: this.projectReady(), module: 'context' as ModuleKey },
    { label: 'Tecnicas', complete: this.sessions().length > 0, module: 'techniques' as ModuleKey },
    { label: 'Evidencias', complete: this.evidenceCount() > 0 && this.techniquesWithoutEvidenceCount() === 0, module: 'evidences' as ModuleKey },
    { label: 'Hallazgos', complete: this.findings().length > 0, module: 'findings' as ModuleKey },
    { label: 'Requisitos', complete: this.requirements().length > 0 && this.orphanFindingsCount() === 0, module: 'requirements' as ModuleKey },
    { label: 'Specs', complete: this.specArtifacts().length > 0, module: 'specs' as ModuleKey },
    { label: 'Agente', complete: this.agentTasks().length > 0, module: 'agent' as ModuleKey },
    { label: 'Trazabilidad', complete: this.traceabilityHealth() === 100 && this.requirements().length > 0, module: 'traceability' as ModuleKey }
  ]);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectsService: ProjectsService,
    private readonly processesService: ProcessesService,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('ID de proyecto invalido.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.refresh(id);
    });
  }

  setActiveModule(module: ModuleKey) {
    this.activeModule.set(module);
    this.error.set(null);
    this.success.set(null);
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

  setTraceView(view: TraceViewKey) {
    this.activeTraceView.set(view);
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
      this.error.set('Necesitas specs derivadas para revisar tareas de agente.');
      return;
    }
    this.setActiveModule('agent');
  }

  generateEditableDiagram(kind: DiagramKind = 'use_case') {
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

    this.diagram.set(builders[kind]());
    this.selectedDiagramNodeId.set(null);
    this.selectedDiagramEdgeId.set(null);
    this.connectSourceNodeId.set(null);
    this.exportedDiagramJson.set(null);
    this.success.set('Diagrama editable generado desde requisitos y specs.');
  }

  setDiagramMode(mode: DiagramEditorMode) {
    this.diagramMode.set(mode);
    this.connectSourceNodeId.set(null);
  }

  addDiagramNode(type: DiagramNodeType) {
    const current = this.ensureDiagram();
    const count = current.nodes.length + 1;
    const node: DiagramNode = {
      id: `node-${Date.now()}-${count}`,
      type,
      label: this.defaultDiagramNodeLabel(type, count),
      x: 90 + (count % 4) * 150,
      y: 80 + Math.floor(count / 4) * 110,
      width: type === 'actor' ? 96 : type === 'lifeline' ? 130 : 150,
      height: type === 'actor' ? 64 : type === 'lifeline' ? 360 : 68
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

  onDiagramPointerMove(event: PointerEvent) {
    const dragging = this.draggingNode();
    const current = this.diagram();
    if (!dragging || !current) {
      return;
    }
    const point = this.diagramPoint(event);
    const nextNodes = current.nodes.map((node) =>
      node.id === dragging.nodeId
        ? { ...node, x: Math.max(16, point.x - dragging.offsetX), y: Math.max(16, point.y - dragging.offsetY) }
        : node
    );
    this.diagram.set({ ...current, nodes: nextNodes });
  }

  stopDiagramDrag() {
    this.draggingNode.set(null);
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

  autoLayoutDiagram() {
    const current = this.diagram();
    if (!current) {
      return;
    }
    const nextNodes = current.nodes.map((node, index) => ({
      ...node,
      x: 70 + (index % 4) * 180,
      y: 70 + Math.floor(index / 4) * 130
    }));
    this.diagram.set({ ...current, nodes: nextNodes });
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

  diagramNodeCenter(nodeId: string) {
    const node = this.diagram()?.nodes.find((item) => item.id === nodeId);
    return node ? { x: node.x + node.width / 2, y: node.y + node.height / 2 } : { x: 0, y: 0 };
  }

  diagramNodeClass(node: DiagramNode) {
    return `diagram-node node-${node.type}${this.selectedDiagramNodeId() === node.id ? ' selected' : ''}`;
  }

  diagramNodeLines(node: DiagramNode) {
    const maxLength = node.type === 'class' ? 34 : 28;
    return node.label
      .split('\n')
      .flatMap((line) => (line.length > maxLength ? [`${line.slice(0, maxLength - 3)}...`] : [line]))
      .slice(0, node.type === 'class' ? 7 : 3);
  }

  moduleSessions(module: CaptureModuleKey) {
    const technique = this.techniqueModules.find((item) => item.key === module)?.technique;
    return this.sessions().filter((session) => session.technique === technique);
  }

  sessionEvidences(sessionId: number) {
    return this.evidencesBySession()[sessionId] ?? [];
  }

  sessionsForFindings() {
    return this.sessions().filter((session) => session.evidence_count > 0);
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

    const stakeholderIds = await this.stakeholderIdsForCapture(projectId, module);
    if (stakeholderIds.length === 0) {
      form.markAllAsTouched();
      return;
    }

    const title = this.captureTitle(module);
    const notes = this.captureNotes(module);
    this.setSavingState();
    this.traceabilityService
      .createSession(projectId, {
        title,
        technique: config.technique,
        notes,
        occurred_at: new Date().toISOString(),
        stakeholder_ids: stakeholderIds
      })
      .subscribe({
        next: (response) => {
          this.success.set(`${config.label} registrado.`);
          if (module === 'interviews') {
            this.persistInterviewEvidences(response.id, notes, projectId).finally(() => this.resetCapture(module));
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
    const projectId = this.projectId();
    const sessionIds = this.sessionsForFindings().map((session) => session.id);
    if (!projectId || sessionIds.length === 0) {
      this.error.set('Necesitas tecnicas con evidencia para generar hallazgos con IA.');
      return;
    }

    this.setSavingState();
    this.traceabilityService
      .generateAIDraftFindings(projectId, { session_ids: sessionIds, max_drafts: 8, prompt_version: 'workspace-v1' })
      .subscribe({
        next: (response) => {
          this.success.set(`IA genero ${response.generated_count} borrador(es) de hallazgo.`);
          this.saving.set(false);
          this.loadAIDrafts(projectId);
        },
        error: (err) => this.fail(err, 'No se pudieron generar hallazgos con IA.')
      });
  }

  generateAIRequirements() {
    const projectId = this.projectId();
    const findingIds = this.findings().map((finding) => finding.id);
    if (!projectId || findingIds.length === 0) {
      this.error.set('Necesitas hallazgos para generar requisitos con IA.');
      return;
    }

    this.setSavingState();
    this.traceabilityService
      .generateAIDraftRequirements(projectId, { finding_ids: findingIds, max_drafts: 8, prompt_version: 'workspace-v1' })
      .subscribe({
        next: (response) => {
          this.success.set(`IA genero ${response.generated_count} borrador(es) de requisito.`);
          this.saving.set(false);
          this.loadAIDrafts(projectId);
        },
        error: (err) => this.fail(err, 'No se pudieron generar requisitos con IA.')
      });
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
        error: (err) => this.fail(err, 'No se pudo aceptar el hallazgo IA.')
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
      error: (err) => this.fail(err, 'No se pudo rechazar el hallazgo IA.')
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
        error: (err) => this.fail(err, 'No se pudo aceptar el requisito IA.')
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
      error: (err) => this.fail(err, 'No se pudo rechazar el requisito IA.')
    });
  }

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
    this.loadTraceability(projectId);
    this.loadFlowStatus(projectId);
    this.loadAIDrafts(projectId);
    this.loading.set(false);
  }

  private afterMutation(projectId: number) {
    this.saving.set(false);
    this.loadStakeholders(projectId);
    this.loadProcesses(projectId);
    this.loadSessions(projectId);
    this.loadFindings(projectId);
    this.loadRequirements(projectId);
    this.loadTraceability(projectId);
    this.loadFlowStatus(projectId);
    this.loadAIDrafts(projectId);
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
      next: (response) => this.processes.set(response.processes ?? []),
      error: () => this.processes.set([])
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
          `Entrevistador tecnico: ${interviewer?.name ?? 'No seleccionado'} (${interviewer?.email ?? 'sin correo'})`,
          `Entrevistado: ${interviewee}`,
          `Preguntas y respuestas:\n${value.questions}`,
          value.transcript ? `Transcripcion:\n${value.transcript}` : '',
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
        return [`Nota: ${value.note}`, value.keyPoint ? `Punto clave: ${value.keyPoint}` : ''].filter(Boolean).join('\n');
      }
      case 'focus': {
        const value = this.focusForm.getRawValue();
        return [
          `Moderador: ${value.moderator}`,
          value.mediaType ? `Tipo de media: ${value.mediaType}` : '',
          `Objetivo: ${value.objective}`,
          value.conclusions ? `Conclusiones: ${value.conclusions}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'documents': {
        const value = this.documentForm.getRawValue();
        return [
          `Tipo: ${value.documentType}`,
          `Fuente: ${value.source}`,
          `Documento analizado: ${value.documentName}`,
          value.findings ? `Hallazgos: ${value.findings}` : ''
        ].filter(Boolean).join('\n');
      }
      case 'tracking': {
        const value = this.trackingForm.getRawValue();
        return [
          `ID transaccion: ${value.transactionId}`,
          `Proceso: ${value.processName}`,
          `Paso: ${value.stepName}`,
          value.duration ? `Duracion: ${value.duration}` : '',
          value.metrics ? `Metricas: ${value.metrics}` : ''
        ].filter(Boolean).join('\n');
      }
    }
  }

  private resetCapture(module: CaptureModuleKey) {
    this.formForCapture(module).reset();
    this.interviewForm.patchValue({
      interviewer_user_id: null,
      interviewed_stakeholder_id: null,
      questions: '',
      transcript: '',
      notes: ''
    });
    this.selectedInterviewFiles.set([]);
    this.surveyForm.patchValue({ participants: 0, status: 'draft' });
  }

  private async stakeholderIdsForCapture(projectId: number, module: CaptureModuleKey): Promise<number[]> {
    if (module === 'interviews') {
      return this.resolveInterviewStakeholderIds(projectId);
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

  private escapeDiagramText(value: string) {
    return value.replace(/"/g, "'");
  }

  private removeAccents(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private toPascalCase(value: string) {
    const cleaned = this.removeAccents(value)
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
    const text = this.removeAccents(this.domainText(useCases)).toLowerCase();
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
          .flatMap((useCase) => useCase.requirement.description.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}\b/g) ?? [])
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
      sourceSpecIds: useCases.map((useCase) => `spec-${useCase.requirement.id}`),
      nodes,
      edges,
      derived: true
    };
  }

  private buildClassDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const entities = this.inferDomainEntities(useCases);
    const nodes = entities.map((entity, index) => ({
      id: `class-${entity.name}`,
      type: 'class' as const,
      label: `${entity.name}\n${entity.attributes.map((attr) => `- ${attr}`).join('\n')}\n${entity.operations.map((op) => `+ ${op}`).join('\n')}`,
      x: 70 + (index % 3) * 280,
      y: 70 + Math.floor(index / 3) * 180,
      width: 210,
      height: 145
    }));
    const edges = entities.slice(1).map((entity, index) => ({
      id: `class-edge-${index}`,
      sourceNodeId: `class-${entities[0].name}`,
      targetNodeId: `class-${entity.name}`,
      type: 'association' as const,
      label: index === 0 ? 'gestiona' : 'relaciona'
    }));
    return this.diagramModel(projectId, 'class', 'Diagrama UML de clases', nodes, edges, useCases);
  }

  private buildSequenceDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const first = useCases[0];
    const entities = this.inferDomainEntities(useCases);
    const mainEntity = entities[0]?.name ?? 'Entidad';
    const action = first?.action ?? 'ejecutar caso de uso';
    const nodes: DiagramNode[] = [
      { id: 'seq-actor', type: 'lifeline', label: first?.actor ?? 'Stakeholder', x: 50, y: 40, width: 130, height: 430 },
      { id: 'seq-ui', type: 'lifeline', label: `Pantalla ${mainEntity}`, x: 250, y: 40, width: 150, height: 430 },
      { id: 'seq-service', type: 'lifeline', label: `${mainEntity}Service`, x: 470, y: 40, width: 150, height: 430 },
      { id: 'seq-repo', type: 'lifeline', label: `${mainEntity}Repository`, x: 700, y: 40, width: 150, height: 430 }
    ];
    const edges: DiagramEdge[] = [
      { id: 'seq-edge-1', sourceNodeId: 'seq-actor', targetNodeId: 'seq-ui', type: 'association', label: `1. ${action}` },
      { id: 'seq-edge-2', sourceNodeId: 'seq-ui', targetNodeId: 'seq-service', type: 'association', label: `2. validar ${mainEntity}` },
      { id: 'seq-edge-3', sourceNodeId: 'seq-service', targetNodeId: 'seq-repo', type: 'association', label: `3. guardar/consultar ${mainEntity}` },
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
      { id: 'pkg-edge-1', sourceNodeId: 'pkg-foundation', targetNodeId: 'pkg-discovery', type: 'dependency' },
      { id: 'pkg-edge-2', sourceNodeId: 'pkg-discovery', targetNodeId: 'pkg-analysis', type: 'dependency' },
      { id: 'pkg-edge-3', sourceNodeId: 'pkg-analysis', targetNodeId: 'pkg-spec', type: 'dependency' },
      { id: 'pkg-edge-4', sourceNodeId: 'pkg-spec', targetNodeId: 'pkg-delivery', type: 'dependency' }
    ];
    return this.diagramModel(projectId, 'package', 'Diagrama de paquetes', nodes, edges, useCases);
  }

  private buildComponentDiagram(projectId: number | null, useCases: DerivedUseCase[]): DiagramModel {
    const entities = this.inferDomainEntities(useCases);
    const mainEntity = entities[0]?.name ?? 'Dominio';
    const nodes: DiagramNode[] = [
      { id: 'cmp-ui', type: 'component', label: `${mainEntity} UI`, x: 90, y: 100, width: 180, height: 80 },
      { id: 'cmp-api', type: 'component', label: `${mainEntity} API`, x: 370, y: 100, width: 170, height: 80 },
      { id: 'cmp-service', type: 'component', label: `${mainEntity}Service`, x: 650, y: 100, width: 180, height: 80 },
      { id: 'cmp-db', type: 'component', label: `${mainEntity} DB`, x: 650, y: 300, width: 170, height: 80 },
      { id: 'cmp-auth', type: 'component', label: 'Auth/Roles', x: 370, y: 300, width: 160, height: 80 }
    ];
    const edges: DiagramEdge[] = [
      { id: 'cmp-edge-1', sourceNodeId: 'cmp-ui', targetNodeId: 'cmp-api', type: 'dependency', label: 'REST' },
      { id: 'cmp-edge-2', sourceNodeId: 'cmp-api', targetNodeId: 'cmp-service', type: 'dependency', label: 'orquesta' },
      { id: 'cmp-edge-3', sourceNodeId: 'cmp-service', targetNodeId: 'cmp-db', type: 'dependency', label: 'persistencia' },
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
    useCases: DerivedUseCase[]
  ): DiagramModel {
    return {
      id: `diagram-${type}-${Date.now()}`,
      projectId,
      type,
      title,
      sourceRequirementIds: useCases.map((useCase) => useCase.requirement.id),
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
      sourceSpecIds: [],
      nodes: [],
      edges: [],
      derived: false
    };
    this.diagram.set(empty);
    return empty;
  }

  private defaultDiagramNodeLabel(type: DiagramNodeType, count: number) {
    const labels: Record<DiagramNodeType, string> = {
      actor: `Actor ${count}`,
      use_case: `Caso de uso ${count}`,
      class: `Clase ${count}`,
      package: `Paquete ${count}`,
      component: `Componente ${count}`,
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
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0)
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
