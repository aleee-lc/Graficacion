import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProcessesService, type Process } from '../../services/processes.service';
import { ProjectsService, type Project } from '../../services/projects.service';
import {
  TraceabilityService,
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
  | 'stakeholders'
  | 'processes'
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'stories'
  | 'documents'
  | 'tracking'
  | 'findings'
  | 'requirements'
  | 'traceability';

type CaptureModuleKey =
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'stories'
  | 'documents'
  | 'tracking';

type WorkspaceModule = {
  key: ModuleKey;
  label: string;
  icon: string;
  tone: string;
  technique?: string;
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
    { key: 'stakeholders', label: 'Stakeholders', icon: 'group', tone: 'cyan' },
    { key: 'processes', label: 'Procesos', icon: 'account_tree', tone: 'emerald' },
    { key: 'interviews', label: 'Entrevistas', icon: 'chat_bubble', tone: 'blue', technique: 'Entrevista' },
    { key: 'surveys', label: 'Encuestas', icon: 'assignment', tone: 'green', technique: 'Encuesta' },
    { key: 'observations', label: 'Observaciones', icon: 'visibility', tone: 'orange', technique: 'Observacion' },
    { key: 'focus', label: 'Focus Groups', icon: 'groups', tone: 'pink', technique: 'Focus Group' },
    { key: 'stories', label: 'Historias', icon: 'menu_book', tone: 'indigo', technique: 'Historia de Usuario' },
    { key: 'documents', label: 'Documentos', icon: 'folder_open', tone: 'amber', technique: 'Documento' },
    { key: 'tracking', label: 'Seguimiento', icon: 'trending_up', tone: 'red', technique: 'Seguimiento Transaccional' },
    { key: 'findings', label: 'Hallazgos', icon: 'search', tone: 'slate' },
    { key: 'requirements', label: 'Requisitos', icon: 'fact_check', tone: 'violet' },
    { key: 'traceability', label: 'Trazabilidad', icon: 'hub', tone: 'purple' }
  ];

  readonly projectId = signal<number | null>(null);
  readonly project = signal<Project | null>(null);
  readonly activeModule = signal<ModuleKey>('summary');
  readonly darkMode = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly stakeholders = signal<Stakeholder[]>([]);
  readonly processes = signal<Process[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly evidencesBySession = signal<Record<number, Evidence[]>>({});
  readonly findings = signal<Finding[]>([]);
  readonly requirements = signal<Requirement[]>([]);
  readonly traceability = signal<TraceabilityItem[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);

  readonly stakeholderForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    role: ['', [Validators.required, Validators.minLength(2)]],
    type: ['external' as 'internal' | 'external', [Validators.required]],
    contact: ['']
  });

  readonly processForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', [Validators.required, Validators.minLength(8)]]
  });

  readonly interviewForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    interviewer: ['', [Validators.required, Validators.minLength(2)]],
    interviewed: ['', [Validators.required, Validators.minLength(2)]],
    question: ['', [Validators.required, Validators.minLength(4)]],
    answer: ['', [Validators.required, Validators.minLength(12)]],
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

  readonly storyForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    role: ['', [Validators.required, Validators.minLength(2)]],
    action: ['', [Validators.required, Validators.minLength(4)]],
    benefit: ['', [Validators.required, Validators.minLength(4)]],
    criteria: ['', [Validators.required, Validators.minLength(8)]],
    priority: ['medium' as 'low' | 'medium' | 'high' | 'critical']
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

  readonly captureModules = computed(() =>
    this.modules.filter((item): item is WorkspaceModule & { key: CaptureModuleKey; technique: string } =>
      Boolean(item.technique)
    )
  );

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

  moduleSessions(module: CaptureModuleKey) {
    const technique = this.modules.find((item) => item.key === module)?.technique;
    return this.sessions().filter((session) => session.technique === technique);
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

  saveCapture(module: CaptureModuleKey) {
    const projectId = this.projectId();
    const config = this.modules.find((item) => item.key === module);
    const form = this.formForCapture(module);
    if (!projectId || !config?.technique || form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const title = this.captureTitle(module);
    const notes = this.captureNotes(module);
    const stakeholderId = this.stakeholders()[0]?.id;
    this.setSavingState();
    this.traceabilityService
      .createSession(projectId, {
        title,
        technique: config.technique,
        notes,
        occurred_at: new Date().toISOString(),
        stakeholder_ids: stakeholderId ? [stakeholderId] : []
      })
      .subscribe({
        next: (response) => {
          this.success.set(`${config.label} registrado.`);
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

  private refresh(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.loadProject(projectId);
    this.loadStakeholders(projectId);
    this.loadProcesses(projectId);
    this.loadSessions(projectId);
    this.loadFindings(projectId);
    this.loadRequirements(projectId);
    this.loadTraceability(projectId);
    this.loadFlowStatus(projectId);
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
  }

  private loadProject(projectId: number) {
    this.projectsService.getProject(projectId).subscribe({
      next: (response) => this.project.set(response.project),
      error: () => this.project.set(null)
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

  private formForCapture(module: CaptureModuleKey): any {
    const forms = {
      interviews: this.interviewForm,
      surveys: this.surveyForm,
      observations: this.observationForm,
      focus: this.focusForm,
      stories: this.storyForm,
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
        return [
          `Entrevistador: ${value.interviewer}`,
          `Entrevistado: ${value.interviewed}`,
          `Pregunta: ${value.question}`,
          `Respuesta: ${value.answer}`,
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
      case 'stories': {
        const value = this.storyForm.getRawValue();
        return [
          `Como ${value.role}`,
          `Quiero ${value.action}`,
          `Para ${value.benefit}`,
          `Criterios de aceptacion: ${value.criteria}`,
          `Prioridad: ${value.priority}`
        ].join('\n');
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
    this.surveyForm.patchValue({ participants: 0, status: 'draft' });
    this.storyForm.patchValue({ priority: 'medium' });
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
