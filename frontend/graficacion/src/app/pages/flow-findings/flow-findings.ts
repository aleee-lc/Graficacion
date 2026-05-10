import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  type ValidatorFn,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  TraceabilityService,
  type AIDraftFinding,
  type Finding,
  type FlowStatus,
  type Session
} from '../../services/traceability.service';

type DuplicateConflict = {
  dedupe_key: string;
  duplicate: {
    id: number;
    statement: string;
    session_id: number;
    session_title: string;
  };
};

const minimumWordsValidator =
  (minimum: number): ValidatorFn =>
  (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (value.length === 0) {
      return null;
    }

    const words = value.split(/\s+/).filter(Boolean);
    if (words.length >= minimum) {
      return null;
    }

    return {
      minWords: {
        required: minimum,
        actual: words.length
      }
    };
  };

const normalizeText = (value: string) => String(value ?? '').trim().replace(/\s+/g, ' ');

const wordsCount = (value: string) => normalizeText(value).split(/\s+/).filter(Boolean).length;

@Component({
  selector: 'app-flow-findings',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './flow-findings.html'
})
export class FlowFindingsPage {
  readonly projectId = signal<number | null>(null);
  readonly sessions = signal<Session[]>([]);
  readonly findings = signal<Finding[]>([]);
  readonly aiDraftFindings = signal<AIDraftFinding[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly duplicateConflict = signal<DuplicateConflict | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly aiGenerating = signal(false);
  readonly aiSavingDraftById = signal<Record<number, boolean>>({});
  readonly aiDraftEdits = signal<
    Record<number, { category: 'problem' | 'need' | 'constraint'; statement: string }>
  >({});
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly form;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.form = this.fb.group({
      session_id: [null as number | null, [Validators.required]],
      category: ['need' as 'problem' | 'need' | 'constraint', [Validators.required]],
      statement: ['', [Validators.required, Validators.minLength(20), minimumWordsValidator(4)]],
      dedupe_key: ['']
    });

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

  createFinding(allowDuplicate = false) {
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.session_id) {
      this.form.markAllAsTouched();
      this.error.set('Completa los campos obligatorios del hallazgo.');
      return;
    }
    if (!this.canCreateFinding()) {
      this.error.set('Completa primero el Paso 2: sesiones con evidencia.');
      return;
    }

    this.error.set(null);
    this.success.set(null);
    this.duplicateConflict.set(null);
    this.saving.set(true);
    this.traceabilityService
      .createSessionFinding(value.session_id, {
        category: value.category ?? 'need',
        statement: value.statement ?? '',
        dedupe_key: value.dedupe_key || null,
        allow_duplicate: allowDuplicate
      })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.form.patchValue({
            category: 'need',
            statement: '',
            dedupe_key: ''
          });
          this.success.set(
            response.duplicate_warning?.message ??
              'Hallazgo creado.'
          );
          const projectId = this.projectId();
          if (projectId) {
            this.loadFindings(projectId);
            this.loadSessions(projectId);
            this.loadFlowStatus(projectId);
          }
        },
        error: (err) => {
          this.saving.set(false);
          if (err?.status === 409 && err?.error?.duplicate) {
            this.duplicateConflict.set({
              dedupe_key: err.error.dedupe_key,
              duplicate: err.error.duplicate
            });
            this.error.set('Posible duplicado detectado. Revisa y confirma si deseas guardarlo.');
            return;
          }
          this.error.set(this.normalizeFindingError(err) ?? 'No se pudo crear el hallazgo.');
        }
      });
  }

  confirmDuplicateCreation() {
    this.createFinding(true);
  }

  generateAIDraftFindings() {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    const availableSessionIds = this.sessionsWithEvidence().map((session) => session.id);
    if (availableSessionIds.length < 1) {
      this.error.set('No hay sesiones con evidencia para generar borradores IA.');
      this.success.set(null);
      return;
    }

    this.aiGenerating.set(true);
    this.error.set(null);
    this.success.set(null);
    this.traceabilityService
      .generateAIDraftFindings(projectId, {
        session_ids: availableSessionIds,
        max_drafts: 8,
        prompt_version: 'v1'
      })
      .subscribe({
        next: (response) => {
          this.aiGenerating.set(false);
          this.aiDraftFindings.set(response.drafts ?? []);
          this.initializeAIDraftEdits(response.drafts ?? []);
          this.success.set(
            `IA generó ${response.generated_count} borrador(es) de hallazgo. Revisa y acepta antes de crear hallazgos finales.`
          );
        },
        error: (err) => {
          this.aiGenerating.set(false);
          this.error.set(this.normalizeAIDraftError(err) ?? 'No se pudieron generar borradores IA.');
        }
      });
  }

  pendingAIDraftFindings() {
    return this.aiDraftFindings().filter((draft) => draft.status === 'pending');
  }

  reviewedAIDraftFindings() {
    return this.aiDraftFindings().filter((draft) => draft.status !== 'pending');
  }

  aiDraftEdit(draftId: number) {
    const current = this.aiDraftEdits()[draftId];
    if (current) {
      return current;
    }

    const draft = this.aiDraftFindings().find((item) => item.id === draftId);
    return {
      category: draft?.category ?? 'need',
      statement: draft?.statement ?? ''
    };
  }

  setAIDraftCategory(draftId: number, category: 'problem' | 'need' | 'constraint') {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, category }
    });
  }

  setAIDraftStatement(draftId: number, statement: string) {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, statement }
    });
  }

  acceptAIDraftFinding(draftId: number) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    const edit = this.aiDraftEdit(draftId);
    if (normalizeText(edit.statement).length < 20 || wordsCount(edit.statement) < 4) {
      this.error.set('El borrador debe tener al menos 20 caracteres y 4 palabras para aceptarse.');
      return;
    }

    this.setAIDraftSaving(draftId, true);
    this.traceabilityService
      .updateAIDraftFinding(projectId, draftId, {
        status: 'accepted',
        category: edit.category,
        statement: normalizeText(edit.statement)
      })
      .subscribe({
        next: (response) => {
          this.setAIDraftSaving(draftId, false);
          this.applyAIDraftUpdate(response.draft);
          this.success.set(`Borrador IA #${draftId} aceptado. Ahora puedes usarlo para crear el hallazgo final.`);
        },
        error: (err) => {
          this.setAIDraftSaving(draftId, false);
          this.error.set(this.normalizeAIDraftError(err) ?? 'No se pudo actualizar el borrador IA.');
        }
      });
  }

  rejectAIDraftFinding(draftId: number) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    this.setAIDraftSaving(draftId, true);
    this.traceabilityService
      .updateAIDraftFinding(projectId, draftId, {
        status: 'rejected'
      })
      .subscribe({
        next: (response) => {
          this.setAIDraftSaving(draftId, false);
          this.applyAIDraftUpdate(response.draft);
          this.success.set(`Borrador IA #${draftId} rechazado.`);
        },
        error: (err) => {
          this.setAIDraftSaving(draftId, false);
          this.error.set(this.normalizeAIDraftError(err) ?? 'No se pudo actualizar el borrador IA.');
        }
      });
  }

  useAIDraftInForm(draftId: number) {
    const draft = this.aiDraftFindings().find((item) => item.id === draftId);
    if (!draft) {
      return;
    }
    const edit = this.aiDraftEdit(draftId);
    this.form.patchValue({
      session_id: draft.source_session_id,
      category: edit.category,
      statement: normalizeText(edit.statement),
      dedupe_key: ''
    });
    this.form.markAsDirty();
    this.success.set(`Borrador IA #${draftId} cargado al formulario. Revisa y guarda el hallazgo final.`);
  }

  aiDraftSaving(draftId: number) {
    return this.aiSavingDraftById()[draftId] ?? false;
  }

  sessionsWithEvidence() {
    return this.sessions().filter((session) => session.evidence_count > 0);
  }

  sessionsWithoutEvidenceCount() {
    return this.sessions().filter((session) => session.evidence_count < 1).length;
  }

  canCreateFinding() {
    return (this.flowStatus()?.steps.step3.locked ?? true) === false && this.sessionsWithEvidence().length > 0;
  }

  canGoToRequirements() {
    return this.flowStatus()?.steps.step3.complete ?? false;
  }

  statementLength() {
    return String(this.form.get('statement')?.value ?? '').trim().length;
  }

  statementWordCount() {
    return String(this.form.get('statement')?.value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  categoryLabel(category: 'problem' | 'need' | 'constraint') {
    if (category === 'problem') {
      return 'Problema';
    }
    if (category === 'need') {
      return 'Necesidad';
    }
    return 'Restriccion';
  }

  private refresh(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.duplicateConflict.set(null);
    this.loadFlowStatus(projectId, true);
  }

  private loadFlowStatus(projectId: number, bootstrap = false) {
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
        if (response.flow_status.steps.step3.locked) {
          this.error.set(response.flow_status.next_action.message);
          this.router.navigate(['/projects', projectId, 'sessions']);
          return;
        }
        if (bootstrap) {
          this.loadSessions(projectId);
          this.loadFindings(projectId);
          this.loadAIDraftFindings(projectId);
          this.loading.set(false);
        }
      },
      error: () => {
        this.flowStatus.set(null);
        if (bootstrap) {
          this.loadSessions(projectId);
          this.loadFindings(projectId);
          this.loadAIDraftFindings(projectId);
          this.loading.set(false);
        }
      }
    });
  }

  private loadSessions(projectId: number) {
    this.traceabilityService.getSessions(projectId).subscribe({
      next: (response) => {
        const sessions = response.sessions ?? [];
        this.sessions.set(sessions);
        const current = this.form.get('session_id')?.value;
        const available = sessions.filter((session) => session.evidence_count > 0);
        if ((!current || !available.some((session) => session.id === current)) && available.length > 0) {
          this.form.patchValue({ session_id: available[0].id });
        }
      },
      error: () => {
        this.sessions.set([]);
      }
    });
  }

  private loadFindings(projectId: number) {
    this.traceabilityService.getProjectFindings(projectId).subscribe({
      next: (response) => {
        this.findings.set(response.findings ?? []);
      },
      error: () => {
        this.findings.set([]);
      }
    });
  }

  private loadAIDraftFindings(projectId: number) {
    this.traceabilityService.getAIDraftFindings(projectId).subscribe({
      next: (response) => {
        const drafts = response.drafts ?? [];
        this.aiDraftFindings.set(drafts);
        this.initializeAIDraftEdits(drafts);
      },
      error: () => {
        this.aiDraftFindings.set([]);
        this.aiDraftEdits.set({});
      }
    });
  }

  private initializeAIDraftEdits(drafts: AIDraftFinding[]) {
    const next: Record<number, { category: 'problem' | 'need' | 'constraint'; statement: string }> = {};
    for (const draft of drafts) {
      next[draft.id] = {
        category: draft.category,
        statement: draft.statement
      };
    }
    this.aiDraftEdits.set(next);
  }

  private setAIDraftSaving(draftId: number, value: boolean) {
    this.aiSavingDraftById.set({
      ...this.aiSavingDraftById(),
      [draftId]: value
    });
  }

  private applyAIDraftUpdate(updated: AIDraftFinding) {
    this.aiDraftFindings.set(
      this.aiDraftFindings().map((item) => (item.id === updated.id ? updated : item))
    );
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [updated.id]: {
        category: updated.category,
        statement: updated.statement
      }
    });
  }

  private normalizeFindingError(err: {
    error?: { message?: string; errors?: Record<string, string[] | undefined> };
  }): string | null {
    const backendErrors = err?.error?.errors;
    const statementErrors = backendErrors?.['statement'] ?? [];
    if (statementErrors.some((message) => message.includes('at least 4 words'))) {
      return 'El hallazgo debe contener al menos 4 palabras.';
    }
    if (statementErrors.some((message) => message.includes('at least 20'))) {
      return 'El hallazgo debe contener al menos 20 caracteres.';
    }

    const sessionErrors = backendErrors?.['session_id'] ?? [];
    if (sessionErrors.length > 0) {
      return 'Selecciona una sesion valida para registrar el hallazgo.';
    }

    const categoryErrors = backendErrors?.['category'] ?? [];
    if (categoryErrors.length > 0) {
      return 'Selecciona una categoria valida (problema, necesidad o restriccion).';
    }

    const rawMessage = err?.error?.message;
    if (!rawMessage) {
      return null;
    }
    if (rawMessage.includes('Cannot create finding without evidence')) {
      return 'No puedes crear hallazgos en sesiones sin evidencia.';
    }
    if (rawMessage === 'Invalid request') {
      return 'Solicitud invalida. Revisa categoria, sesion y redaccion del hallazgo.';
    }
    return rawMessage;
  }

  private normalizeAIDraftError(err: { error?: { message?: string } }): string | null {
    const message = err?.error?.message;
    if (!message) {
      return null;
    }
    if (message.includes('OPENROUTER_API_KEY')) {
      return 'OPENROUTER_API_KEY no está configurada en el backend.';
    }
    if (message.includes('No sessions with evidence')) {
      return 'No hay sesiones con evidencia para generar borradores IA.';
    }
    if (message.includes('OpenRouter request failed')) {
      return 'La solicitud a OpenRouter falló. Revisa tu API key/modelo.';
    }
    if (message.includes('schema validation')) {
      return 'La respuesta del modelo no cumplió el formato esperado.';
    }
    if (message.includes('did not return valid finding drafts')) {
      return 'La IA no generó borradores válidos para este contexto.';
    }
    return message;
  }
}
