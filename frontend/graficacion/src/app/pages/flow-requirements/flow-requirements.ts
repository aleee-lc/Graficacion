import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  TraceabilityService,
  type AIDraftRequirement,
  type Finding,
  type FlowStatus,
  type Requirement
} from '../../services/traceability.service';

const normalizeText = (value: string) => String(value ?? '').trim().replace(/\s+/g, ' ');

@Component({
  selector: 'app-flow-requirements',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './flow-requirements.html'
})
export class FlowRequirementsPage {
  readonly projectId = signal<number | null>(null);
  readonly findings = signal<Finding[]>([]);
  readonly requirements = signal<Requirement[]>([]);
  readonly aiDraftRequirements = signal<AIDraftRequirement[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly aiGenerating = signal(false);
  readonly aiSavingDraftById = signal<Record<number, boolean>>({});
  readonly aiDraftEdits = signal<
    Record<
      number,
      {
        type: 'functional' | 'non_functional';
        priority: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        acceptance_criteria: string;
        source_finding_ids: number[];
      }
    >
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
      type: ['functional' as 'functional' | 'non_functional', [Validators.required]],
      priority: ['medium' as 'low' | 'medium' | 'high' | 'critical', [Validators.required]],
      description: ['', [Validators.required, Validators.minLength(12)]],
      acceptance_criteria: ['', [Validators.required, Validators.minLength(12)]],
      finding_ids: this.fb.control<number[]>([], [Validators.required])
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

  toggleFinding(findingId: number) {
    const control = this.form.get('finding_ids');
    const current = (control?.value as number[]) ?? [];
    const exists = current.includes(findingId);
    const next = exists ? current.filter((id) => id !== findingId) : [...current, findingId];
    control?.setValue(next);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  findingSelected(findingId: number) {
    const current = (this.form.get('finding_ids')?.value as number[]) ?? [];
    return current.includes(findingId);
  }

  createRequirement() {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Completa los campos obligatorios del requisito.');
      return;
    }
    if (!this.canCreateRequirement()) {
      this.error.set('Completa primero el Paso 3: necesitas hallazgos.');
      return;
    }

    const value = this.form.getRawValue();
    const findingIds = (value.finding_ids ?? []).slice();
    if (findingIds.length === 0) {
      this.error.set('Debes seleccionar al menos un hallazgo fuente.');
      return;
    }

    this.error.set(null);
    this.success.set(null);
    this.saving.set(true);
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
          this.saving.set(false);
          this.success.set(`Requisito ${response.code} creado.`);
          this.form.patchValue({
            type: 'functional',
            priority: 'medium',
            description: '',
            acceptance_criteria: '',
            finding_ids: []
          });
          this.loadRequirements(projectId);
          this.loadFlowStatus(projectId);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(this.normalizeRequirementError(err) ?? 'No se pudo crear el requisito.');
        }
      });
  }

  generateAIDraftRequirements() {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    const selectedFindingIds = (this.form.get('finding_ids')?.value as number[]) ?? [];
    const findingIds =
      selectedFindingIds.length > 0 ? Array.from(new Set(selectedFindingIds)) : this.findings().map((f) => f.id);

    if (findingIds.length < 1) {
      this.error.set('No hay hallazgos para generar borradores IA.');
      return;
    }

    this.aiGenerating.set(true);
    this.error.set(null);
    this.success.set(null);
    this.traceabilityService
      .generateAIDraftRequirements(projectId, {
        finding_ids: findingIds,
        max_drafts: 8,
        prompt_version: 'v1'
      })
      .subscribe({
        next: (response) => {
          this.aiGenerating.set(false);
          this.aiDraftRequirements.set(response.drafts ?? []);
          this.initializeAIDraftEdits(response.drafts ?? []);
          this.success.set(
            `IA generó ${response.generated_count} borrador(es) de requisito. Revisa y acepta antes de crear requisitos finales.`
          );
        },
        error: (err) => {
          this.aiGenerating.set(false);
          this.error.set(this.normalizeRequirementError(err) ?? 'No se pudieron generar borradores IA.');
        }
      });
  }

  pendingAIDraftRequirements() {
    return this.aiDraftRequirements().filter((draft) => draft.status === 'pending');
  }

  reviewedAIDraftRequirements() {
    return this.aiDraftRequirements().filter((draft) => draft.status !== 'pending');
  }

  aiDraftEdit(draftId: number) {
    const current = this.aiDraftEdits()[draftId];
    if (current) {
      return current;
    }
    const draft = this.aiDraftRequirements().find((item) => item.id === draftId);
    return {
      type: draft?.type ?? 'functional',
      priority: draft?.priority ?? 'medium',
      description: draft?.description ?? '',
      acceptance_criteria: draft?.acceptance_criteria ?? '',
      source_finding_ids: draft?.source_finding_ids ?? []
    };
  }

  setAIDraftType(draftId: number, type: 'functional' | 'non_functional') {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, type }
    });
  }

  setAIDraftPriority(draftId: number, priority: 'low' | 'medium' | 'high' | 'critical') {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, priority }
    });
  }

  setAIDraftDescription(draftId: number, description: string) {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, description }
    });
  }

  setAIDraftAcceptance(draftId: number, acceptance: string) {
    const current = this.aiDraftEdit(draftId);
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [draftId]: { ...current, acceptance_criteria: acceptance }
    });
  }

  acceptAIDraftRequirement(draftId: number) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    const edit = this.aiDraftEdit(draftId);
    if (normalizeText(edit.description).length < 12 || normalizeText(edit.acceptance_criteria).length < 12) {
      this.error.set('Descripción y criterio de aceptación deben tener al menos 12 caracteres.');
      return;
    }
    if (edit.source_finding_ids.length < 1) {
      this.error.set('El borrador debe conservar al menos un hallazgo fuente.');
      return;
    }

    this.setAIDraftSaving(draftId, true);
    this.traceabilityService
      .updateAIDraftRequirement(projectId, draftId, {
        status: 'accepted',
        type: edit.type,
        priority: edit.priority,
        description: normalizeText(edit.description),
        acceptance_criteria: normalizeText(edit.acceptance_criteria),
        source_finding_ids: edit.source_finding_ids
      })
      .subscribe({
        next: (response) => {
          this.setAIDraftSaving(draftId, false);
          this.applyAIDraftUpdate(response.draft);
          this.success.set(`Borrador IA #${draftId} aceptado. Puedes usarlo para crear el requisito final.`);
        },
        error: (err) => {
          this.setAIDraftSaving(draftId, false);
          this.error.set(this.normalizeRequirementError(err) ?? 'No se pudo actualizar el borrador IA.');
        }
      });
  }

  rejectAIDraftRequirement(draftId: number) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    this.setAIDraftSaving(draftId, true);
    this.traceabilityService
      .updateAIDraftRequirement(projectId, draftId, {
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
          this.error.set(this.normalizeRequirementError(err) ?? 'No se pudo actualizar el borrador IA.');
        }
      });
  }

  useAIDraftInForm(draftId: number) {
    const edit = this.aiDraftEdit(draftId);
    this.form.patchValue({
      type: edit.type,
      priority: edit.priority,
      description: normalizeText(edit.description),
      acceptance_criteria: normalizeText(edit.acceptance_criteria),
      finding_ids: edit.source_finding_ids
    });
    this.form.markAsDirty();
    this.success.set(`Borrador IA #${draftId} cargado al formulario. Revisa y guarda el requisito final.`);
  }

  aiDraftSaving(draftId: number) {
    return this.aiSavingDraftById()[draftId] ?? false;
  }

  canCreateRequirement() {
    return (this.flowStatus()?.steps.step4.locked ?? true) === false && this.findings().length > 0;
  }

  canGoToTraceability() {
    return this.flowStatus()?.steps.step4.complete ?? false;
  }

  private refresh(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.loadFlowStatus(projectId, true);
  }

  private loadFlowStatus(projectId: number, bootstrap = false) {
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
        if (response.flow_status.steps.step4.locked) {
          this.error.set(response.flow_status.next_action.message);
          this.router.navigate(['/projects', projectId, 'findings']);
          return;
        }
        if (bootstrap) {
          this.loadFindings(projectId);
          this.loadRequirements(projectId);
          this.loadAIDraftRequirements(projectId);
          this.loading.set(false);
        }
      },
      error: () => {
        this.flowStatus.set(null);
        if (bootstrap) {
          this.loadFindings(projectId);
          this.loadRequirements(projectId);
          this.loadAIDraftRequirements(projectId);
          this.loading.set(false);
        }
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

  private loadRequirements(projectId: number) {
    this.traceabilityService.getRequirements(projectId).subscribe({
      next: (response) => {
        this.requirements.set(response.requirements ?? []);
      },
      error: () => {
        this.requirements.set([]);
      }
    });
  }

  private loadAIDraftRequirements(projectId: number) {
    this.traceabilityService.getAIDraftRequirements(projectId).subscribe({
      next: (response) => {
        const drafts = response.drafts ?? [];
        this.aiDraftRequirements.set(drafts);
        this.initializeAIDraftEdits(drafts);
      },
      error: () => {
        this.aiDraftRequirements.set([]);
        this.aiDraftEdits.set({});
      }
    });
  }

  private initializeAIDraftEdits(drafts: AIDraftRequirement[]) {
    const next: Record<
      number,
      {
        type: 'functional' | 'non_functional';
        priority: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        acceptance_criteria: string;
        source_finding_ids: number[];
      }
    > = {};

    for (const draft of drafts) {
      next[draft.id] = {
        type: draft.type,
        priority: draft.priority,
        description: draft.description,
        acceptance_criteria: draft.acceptance_criteria,
        source_finding_ids: [...draft.source_finding_ids]
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

  private applyAIDraftUpdate(updated: AIDraftRequirement) {
    this.aiDraftRequirements.set(
      this.aiDraftRequirements().map((item) => (item.id === updated.id ? updated : item))
    );
    this.aiDraftEdits.set({
      ...this.aiDraftEdits(),
      [updated.id]: {
        type: updated.type,
        priority: updated.priority,
        description: updated.description,
        acceptance_criteria: updated.acceptance_criteria,
        source_finding_ids: [...updated.source_finding_ids]
      }
    });
  }

  private normalizeRequirementError(err: {
    error?: { message?: string; errors?: Record<string, string[] | undefined> };
  }): string | null {
    const message = err?.error?.message;
    if (!message) {
      return null;
    }
    if (message.includes('OPENROUTER_API_KEY')) {
      return 'OPENROUTER_API_KEY no está configurada en el backend.';
    }
    if (message.includes('All finding_ids must belong to this project')) {
      return 'Los hallazgos seleccionados deben pertenecer al proyecto actual.';
    }
    if (message.includes('did not return valid requirement drafts')) {
      return 'La IA no regresó borradores válidos para esos hallazgos.';
    }
    if (message.includes('OpenRouter request failed')) {
      return 'La solicitud a OpenRouter falló. Revisa la API key/modelo.';
    }
    if (message === 'Invalid request') {
      return 'Solicitud inválida. Revisa los campos del borrador.';
    }
    return message;
  }
}
