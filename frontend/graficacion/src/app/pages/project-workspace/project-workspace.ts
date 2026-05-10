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
