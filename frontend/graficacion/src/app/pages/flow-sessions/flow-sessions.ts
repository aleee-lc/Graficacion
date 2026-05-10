import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  TraceabilityService,
  type Evidence,
  type FlowStatus,
  type Session,
  type Stakeholder
} from '../../services/traceability.service';

type EvidenceDraft = {
  kind: 'file' | 'note' | 'transcript';
  notes: string;
};

type AlertKind = 'error' | 'warning' | 'success' | 'info';

type AlertMessage = {
  kind: AlertKind;
  text: string;
};

@Component({
  selector: 'app-flow-sessions',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './flow-sessions.html'
})
export class FlowSessionsPage {
  readonly projectId = signal<number | null>(null);
  readonly stakeholders = signal<Stakeholder[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly evidencesBySession = signal<Record<number, Evidence[]>>({});
  readonly loading = signal(true);
  readonly savingSession = signal(false);
  readonly savingEvidenceBySession = signal<Record<number, boolean>>({});
  readonly openingEvidenceById = signal<Record<number, boolean>>({});
  readonly selectedFilesBySession = signal<Record<number, File[]>>({});
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly evidenceAccept =
    'image/*,audio/*,video/*,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar';
  readonly maxEvidenceFilesPerUpload = 10;
  readonly maxEvidenceFileSizeMb = 25;
  readonly allowedEvidenceMimeTypes = [
    'image/*',
    'audio/*',
    'video/*',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/octet-stream'
  ];

  readonly sessionForm;
  readonly evidenceDrafts = signal<Record<number, EvidenceDraft>>({});

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.sessionForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      technique: ['', [Validators.required, Validators.minLength(3)]],
      notes: ['', [Validators.maxLength(4000)]],
      occurred_at: [''],
      stakeholder_ids: this.fb.control<number[]>([], [Validators.required])
    });

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.errorMessage.set('ID de proyecto invalido.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.refresh(id);
    });
  }

  toggleStakeholder(stakeholderId: number) {
    const control = this.sessionForm.get('stakeholder_ids');
    const current = (control?.value as number[]) ?? [];
    const exists = current.includes(stakeholderId);
    const next = exists ? current.filter((id) => id !== stakeholderId) : [...current, stakeholderId];
    control?.setValue(next);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  stakeholderSelected(stakeholderId: number) {
    const current = (this.sessionForm.get('stakeholder_ids')?.value as number[]) ?? [];
    return current.includes(stakeholderId);
  }

  createSession() {
    const id = this.projectId();
    if (!id) {
      return;
    }
    if (!this.canCreateSession()) {
      this.errorMessage.set('Este paso esta bloqueado. Completa primero el Paso 1.');
      this.successMessage.set(null);
      return;
    }
    if (this.sessionForm.invalid) {
      this.sessionForm.markAllAsTouched();
      this.errorMessage.set('Revisa los campos obligatorios de la sesion.');
      this.successMessage.set(null);
      return;
    }

    const value = this.sessionForm.getRawValue();
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.savingSession.set(true);

    this.traceabilityService
      .createSession(id, {
        title: value.title ?? '',
        technique: value.technique ?? '',
        notes: value.notes || null,
        occurred_at: value.occurred_at || null,
        stakeholder_ids: (value.stakeholder_ids ?? []).slice()
      })
      .subscribe({
        next: () => {
          this.savingSession.set(false);
          this.sessionForm.reset({
            title: '',
            technique: '',
            notes: '',
            occurred_at: '',
            stakeholder_ids: []
          });
          this.successMessage.set('Sesion creada. Ahora agrega evidencia para habilitar el siguiente paso.');
          this.loadSessions(id);
          this.loadFlowStatus(id);
        },
        error: (err) => {
          this.savingSession.set(false);
          this.errorMessage.set(this.normalizeBackendMessage(err?.error?.message) ?? 'No se pudo crear la sesion.');
          this.successMessage.set(null);
        }
      });
  }

  setEvidenceDraft(sessionId: number, key: keyof EvidenceDraft, value: string) {
    const current = this.getEvidenceDraft(sessionId);
    const next: EvidenceDraft =
      key === 'kind'
        ? {
            kind: value as EvidenceDraft['kind'],
            notes: ''
          }
        : {
            ...current,
            [key]: value
          };

    this.evidenceDrafts.set({
      ...this.evidenceDrafts(),
      [sessionId]: next
    });

    if (key === 'kind' && value !== 'file') {
      this.selectedFilesBySession.set({
        ...this.selectedFilesBySession(),
        [sessionId]: []
      });
    }
  }

  getEvidenceDraft(sessionId: number): EvidenceDraft {
    return this.evidenceDrafts()[sessionId] ?? { kind: 'note', notes: '' };
  }

  onEvidenceFilesSelected(sessionId: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (files.length > this.maxEvidenceFilesPerUpload) {
      this.errorMessage.set(`Solo puedes subir hasta ${this.maxEvidenceFilesPerUpload} archivos por carga.`);
      this.successMessage.set(null);
      this.selectedFilesBySession.set({
        ...this.selectedFilesBySession(),
        [sessionId]: []
      });
      input.value = '';
      return;
    }

    const invalidMimeFile = files.find((file) => !this.isEvidenceMimeAllowed(file.type));
    if (invalidMimeFile) {
      this.errorMessage.set(
        `El archivo "${invalidMimeFile.name}" no tiene un tipo permitido para evidencia.`
      );
      this.successMessage.set(null);
      this.selectedFilesBySession.set({
        ...this.selectedFilesBySession(),
        [sessionId]: []
      });
      input.value = '';
      return;
    }

    const maxBytes = this.maxEvidenceFileSizeMb * 1024 * 1024;
    const oversizedFile = files.find((file) => file.size > maxBytes);
    if (oversizedFile) {
      this.errorMessage.set(
        `El archivo "${oversizedFile.name}" supera el maximo de ${this.maxEvidenceFileSizeMb} MB.`
      );
      this.successMessage.set(null);
      this.selectedFilesBySession.set({
        ...this.selectedFilesBySession(),
        [sessionId]: []
      });
      input.value = '';
      return;
    }

    this.selectedFilesBySession.set({
      ...this.selectedFilesBySession(),
      [sessionId]: files
    });
    this.errorMessage.set(null);
  }

  selectedEvidenceFiles(sessionId: number) {
    return this.selectedFilesBySession()[sessionId] ?? [];
  }

  selectedEvidenceFileNames(sessionId: number) {
    return this.selectedEvidenceFiles(sessionId).map((file) => file.name);
  }

  createEvidence(sessionId: number, fileInput?: HTMLInputElement) {
    const draft = this.getEvidenceDraft(sessionId);
    const validationError = this.validateEvidenceDraft(sessionId, draft);
    if (validationError) {
      this.errorMessage.set(validationError);
      this.successMessage.set(null);
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.setSavingEvidence(sessionId, true);

    if (draft.kind === 'file') {
      const files = this.selectedEvidenceFiles(sessionId);
      this.traceabilityService
        .uploadSessionEvidenceFiles(sessionId, files, draft.notes || null)
        .subscribe({
          next: (response) => {
            this.setSavingEvidence(sessionId, false);
            this.successMessage.set(`Se cargaron ${response.uploaded_count} archivo(s) al bucket de evidencias.`);
            this.evidenceDrafts.set({
              ...this.evidenceDrafts(),
              [sessionId]: { kind: 'note', notes: '' }
            });
            this.selectedFilesBySession.set({
              ...this.selectedFilesBySession(),
              [sessionId]: []
            });
            if (fileInput) {
              fileInput.value = '';
            }
            this.loadSessionEvidences(sessionId);
            const projectId = this.projectId();
            if (projectId) {
              this.loadSessions(projectId);
              this.loadFlowStatus(projectId);
            }
          },
          error: (err) => {
            this.setSavingEvidence(sessionId, false);
            this.errorMessage.set(
              this.normalizeBackendMessage(err?.error?.message) ?? 'No se pudieron cargar los archivos.'
            );
            this.successMessage.set(null);
          }
        });
      return;
    }

    this.traceabilityService
      .createSessionEvidence(sessionId, {
        kind: draft.kind,
        notes: draft.notes.trim() || null
      })
      .subscribe({
        next: () => {
          this.setSavingEvidence(sessionId, false);
          this.successMessage.set(`Evidencia registrada en la sesion ${sessionId}.`);
          this.evidenceDrafts.set({
            ...this.evidenceDrafts(),
            [sessionId]: { kind: 'note', notes: '' }
          });
          this.loadSessionEvidences(sessionId);
          const projectId = this.projectId();
          if (projectId) {
            this.loadSessions(projectId);
            this.loadFlowStatus(projectId);
          }
        },
        error: (err) => {
          this.setSavingEvidence(sessionId, false);
          this.errorMessage.set(
            this.normalizeBackendMessage(err?.error?.message) ?? 'No se pudo registrar la evidencia.'
          );
          this.successMessage.set(null);
        }
      });
  }

  openEvidence(sessionId: number, evidence: Evidence) {
    if (!this.canOpenEvidence(evidence)) {
      return;
    }

    this.setOpeningEvidence(evidence.id, true);
    this.errorMessage.set(null);

    this.traceabilityService.createSessionEvidenceSignedUrl(sessionId, evidence.id).subscribe({
      next: (response) => {
        this.setOpeningEvidence(evidence.id, false);
        window.open(response.url, '_blank', 'noopener,noreferrer');
      },
      error: (err) => {
        this.setOpeningEvidence(evidence.id, false);
        this.errorMessage.set(
          this.normalizeBackendMessage(err?.error?.message) ?? 'No se pudo abrir el archivo.'
        );
      }
    });
  }

  canOpenEvidence(evidence: Evidence) {
    return (evidence.kind === 'file' || evidence.kind === 'audio') && Boolean(evidence.object_path);
  }

  isOpeningEvidence(evidenceId: number) {
    return this.openingEvidenceById()[evidenceId] ?? false;
  }

  evidenceKindLabel(kind: EvidenceDraft['kind']) {
    if (kind === 'note') {
      return 'Nota';
    }
    if (kind === 'transcript') {
      return 'Transcripcion';
    }
    return 'Archivo';
  }

  isSavingEvidence(sessionId: number) {
    return this.savingEvidenceBySession()[sessionId] ?? false;
  }

  getSessionEvidences(sessionId: number) {
    return this.evidencesBySession()[sessionId] ?? [];
  }

  canCreateSession() {
    return this.flowStatus()?.steps.step2.locked === false;
  }

  canGoToFindings() {
    return this.flowStatus()?.steps.step2.complete ?? false;
  }

  sessionsMissingEvidenceCount() {
    return this.flowStatus()?.counts.sessions_without_evidence_count ?? 0;
  }

  evidenceRequiredWarning() {
    const pending = this.sessionsMissingEvidenceCount();
    if (pending > 0) {
      return `${pending} sesion(es) siguen sin evidencia. Debes completar eso para avanzar al Paso 3.`;
    }
    return null;
  }

  nextActionStateLabel() {
    return this.canGoToFindings() ? 'Desbloqueado' : 'Bloqueado';
  }

  nextActionReason() {
    if (this.canGoToFindings()) {
      return 'Ya puedes continuar al analisis de hallazgos.';
    }
    if (!this.canCreateSession()) {
      return 'Primero completa el Paso 1: objetivo + stakeholders.';
    }
    return 'Agrega evidencia en todas las sesiones.';
  }

  activeAlert(): AlertMessage | null {
    const error = this.errorMessage();
    const warning = this.evidenceRequiredWarning();
    const success = this.successMessage();
    const info = this.buildInfoMessage();

    if (error) {
      return { kind: 'error', text: error };
    }
    if (warning) {
      return { kind: 'warning', text: warning };
    }
    if (success) {
      return { kind: 'success', text: success };
    }
    if (info) {
      return { kind: 'info', text: info };
    }
    return null;
  }

  private refresh(projectId: number) {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loadFlowStatus(projectId, true);
  }

  private loadStakeholders(projectId: number) {
    this.traceabilityService.getStakeholders(projectId).subscribe({
      next: (response) => {
        this.stakeholders.set(response.stakeholders ?? []);
      },
      error: () => {
        this.stakeholders.set([]);
      }
    });
  }

  private loadSessions(projectId: number) {
    this.traceabilityService.getSessions(projectId).subscribe({
      next: (response) => {
        const sessions = response.sessions ?? [];
        this.sessions.set(sessions);
        for (const item of sessions) {
          this.loadSessionEvidences(item.id);
        }
      },
      error: () => {
        this.sessions.set([]);
      }
    });
  }

  private loadFlowStatus(projectId: number, bootstrap = false) {
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
        if (response.flow_status.steps.step2.locked) {
          this.errorMessage.set('Este paso esta bloqueado. Debes completar primero el Paso 1.');
          this.router.navigate(['/projects', projectId]);
          return;
        }
        if (bootstrap) {
          this.loadStakeholders(projectId);
          this.loadSessions(projectId);
          this.loading.set(false);
        }
      },
      error: () => {
        this.flowStatus.set(null);
        if (bootstrap) {
          this.loadStakeholders(projectId);
          this.loadSessions(projectId);
          this.loading.set(false);
        }
      }
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

  private setSavingEvidence(sessionId: number, value: boolean) {
    this.savingEvidenceBySession.set({
      ...this.savingEvidenceBySession(),
      [sessionId]: value
    });
  }

  private setOpeningEvidence(evidenceId: number, value: boolean) {
    this.openingEvidenceById.set({
      ...this.openingEvidenceById(),
      [evidenceId]: value
    });
  }

  private validateEvidenceDraft(sessionId: number, draft: EvidenceDraft): string | null {
    if (draft.kind === 'note' || draft.kind === 'transcript') {
      if (draft.notes.trim().length < 20) {
        return 'La evidencia tipo nota/transcripcion debe contener al menos 20 caracteres.';
      }
      return null;
    }

    const files = this.selectedEvidenceFiles(sessionId);
    if (files.length < 1) {
      return 'Para evidencia tipo archivo debes seleccionar al menos un archivo.';
    }
    if (files.length > this.maxEvidenceFilesPerUpload) {
      return `Solo puedes subir hasta ${this.maxEvidenceFilesPerUpload} archivos por carga.`;
    }

    const invalidMimeFile = files.find((file) => !this.isEvidenceMimeAllowed(file.type));
    if (invalidMimeFile) {
      return `El archivo "${invalidMimeFile.name}" no tiene un tipo permitido.`;
    }

    const maxBytes = this.maxEvidenceFileSizeMb * 1024 * 1024;
    const oversizedFile = files.find((file) => file.size > maxBytes);
    if (oversizedFile) {
      return `El archivo "${oversizedFile.name}" supera el maximo de ${this.maxEvidenceFileSizeMb} MB.`;
    }

    const emptyFile = files.find((file) => file.size <= 0);
    if (emptyFile) {
      return `El archivo "${emptyFile.name}" esta vacio.`;
    }

    return null;
  }

  private buildInfoMessage(): string | null {
    if (this.sessions().length === 0) {
      return 'Crea la primera sesion y agrega su evidencia para habilitar el Paso 3.';
    }
    return null;
  }

  private normalizeBackendMessage(message?: string | null): string | null {
    if (!message) {
      return null;
    }

    const normalized = message.trim();
    if (normalized.includes('Cannot create finding without evidence')) {
      return 'No puedes crear hallazgos sin evidencia en la sesion.';
    }
    if (normalized.includes('notes must contain at least 20 characters')) {
      return 'La nota/transcripcion debe tener al menos 20 caracteres.';
    }
    if (normalized.includes('At least one evidence file is required')) {
      return 'Debes seleccionar al menos un archivo.';
    }
    if (normalized.includes('unsupported MIME type')) {
      return 'Uno de los archivos tiene un tipo no permitido.';
    }
    if (normalized.includes('Evidence file exceeds max size')) {
      return 'Uno de los archivos supera el tamano maximo permitido.';
    }
    if (normalized.includes('Invalid evidence upload payload')) {
      return 'La carga de evidencias no tiene el formato correcto.';
    }
    if (normalized.includes('SUPABASE_STORAGE_BUCKET is not configured')) {
      return 'El bucket de evidencias no esta configurado en el backend.';
    }
    if (normalized.includes('Supabase storage credentials are not configured')) {
      return 'Faltan las credenciales de storage de Supabase en el backend.';
    }
    if (normalized.includes('Failed to store evidence')) {
      return 'No se pudo guardar el archivo en el bucket.';
    }
    if (normalized.includes('Failed to create evidence signed URL')) {
      return 'No se pudo generar el enlace temporal del archivo.';
    }
    if (normalized.includes('Evidence does not have a storage object')) {
      return 'Esta evidencia no tiene un archivo fisico asociado.';
    }
    if (normalized.includes('Evidence file "') && normalized.includes('is empty')) {
      return 'Uno de los archivos seleccionados esta vacio.';
    }
    if (normalized.includes('Use /sessions/:id/evidences/upload')) {
      return 'Para archivos debes usar la carga real de archivos.';
    }
    return normalized;
  }

  private isEvidenceMimeAllowed(mimeType: string) {
    const normalized = (mimeType || '').trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    return this.allowedEvidenceMimeTypes.some((allowed) => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, allowed.length - 1);
        return normalized.startsWith(prefix);
      }
      return normalized === allowed;
    });
  }
}
