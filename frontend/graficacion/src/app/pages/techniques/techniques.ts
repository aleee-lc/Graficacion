import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { type Observable } from 'rxjs';
import { ProcessesService, type Subprocess } from '../../services/processes.service';
import { ProjectsService, type ProjectUser } from '../../services/projects.service';
import {
  TechniquesService,
  type SubprocessTechnique,
  type Technique,
  type TechniqueAssignmentPayload
} from '../../services/techniques.service';

const requireNonEmptyArray = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as unknown;
  if (Array.isArray(value) && value.length > 0) {
    return null;
  }
  return { requiredArray: true };
};

@Component({
  selector: 'app-techniques',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './techniques.html',
  styleUrl: './techniques.css'
})
export class TechniquesPage {
  readonly projectId = signal<number | null>(null);
  readonly subprocessId = signal<number | null>(null);
  readonly subprocess = signal<Subprocess | null>(null);
  readonly techniques = signal<Technique[]>([]);
  readonly assignments = signal<SubprocessTechnique[]>([]);
  readonly techMembers = signal<ProjectUser[]>([]);
  readonly clientMembers = signal<ProjectUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly assigning = signal(false);
  readonly editingAssignmentId = signal<number | null>(null);

  readonly createForm;
  readonly assignmentForm;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly processesService: ProcessesService,
    private readonly projectsService: ProjectsService,
    private readonly techniquesService: TechniquesService,
    private readonly fb: FormBuilder
  ) {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['']
    });

    this.assignmentForm = this.fb.group({
      technique_id: [null as number | null, [Validators.required]],
      tech_user_id: [null as number | null, [Validators.required]],
      stakeholder_user_ids: this.fb.control<number[]>([], [requireNonEmptyArray]),
      scheduled_date: ['', [Validators.required]],
      duration_minutes: [60 as number | null, [Validators.required, Validators.min(1)]],
      status: ['PLANNED' as 'PLANNED' | 'DONE' | 'CANCELLED', [Validators.required]]
    });

    this.route.paramMap.subscribe((params) => {
      const projectId = Number(params.get('projectId'));
      const subprocessId = Number(params.get('subprocessId'));
      if (Number.isNaN(projectId) || Number.isNaN(subprocessId)) {
        this.error.set('Parametros invalidos.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(projectId);
      this.subprocessId.set(subprocessId);
      this.loadSubprocess(subprocessId);
      this.loadProjectMembers(projectId);
      this.loadTechniques();
      this.loadAssignments(subprocessId);
    });
  }

  toggleStakeholder(userId: number) {
    const control = this.assignmentForm.get('stakeholder_user_ids');
    const current = (control?.value as number[]) ?? [];
    const exists = current.includes(userId);
    const next = exists ? current.filter((id) => id !== userId) : [...current, userId];
    control?.setValue(next);
    control?.markAsDirty();
    control?.markAsTouched();
  }

  isStakeholderSelected(userId: number) {
    const current = (this.assignmentForm.get('stakeholder_user_ids')?.value as number[]) ?? [];
    return current.includes(userId);
  }

  saveAssignment() {
    if (this.assignmentForm.invalid) {
      this.assignmentForm.markAllAsTouched();
      return;
    }

    const subprocessId = this.subprocessId();
    if (!subprocessId) {
      return;
    }

    const value = this.assignmentForm.getRawValue();
    const payload: TechniqueAssignmentPayload = {
      technique_id: value.technique_id as number,
      tech_user_id: value.tech_user_id,
      stakeholder_user_ids: ((value.stakeholder_user_ids as number[]) ?? []).slice(),
      scheduled_date: value.scheduled_date || null,
      duration_minutes: value.duration_minutes,
      status: value.status as 'PLANNED' | 'DONE' | 'CANCELLED'
    };

    this.assigning.set(true);
    this.error.set(null);

    const editingId = this.editingAssignmentId();
    const request: Observable<unknown> = editingId
      ? this.techniquesService.updateTechniqueAssignment(subprocessId, editingId, payload)
      : this.techniquesService.createTechniqueAssignment(subprocessId, payload);

    request.subscribe({
      next: () => {
        this.assigning.set(false);
        this.resetAssignmentForm();
        this.loadAssignments(subprocessId);
      },
      error: (err: any) => {
        this.assigning.set(false);
        const message =
          err?.error?.message ??
          (editingId ? 'No se pudo actualizar la asignacion.' : 'No se pudo asignar la tecnica.');
        this.error.set(message);
      }
    });
  }

  startEditAssignment(item: SubprocessTechnique) {
    this.editingAssignmentId.set(item.id);
    this.error.set(null);

    this.assignmentForm.patchValue({
      technique_id: item.technique_id,
      tech_user_id: item.tech_user_id,
      stakeholder_user_ids: (item.stakeholders ?? []).map((stakeholder) => stakeholder.id),
      scheduled_date: this.toDatetimeLocal(item.scheduled_date),
      duration_minutes: item.duration_minutes ?? 60,
      status: item.status
    });
  }

  cancelEditAssignment() {
    this.resetAssignmentForm();
  }

  cancelAssignment(item: SubprocessTechnique) {
    const subprocessId = this.subprocessId();
    if (!subprocessId) {
      return;
    }

    this.error.set(null);
    this.techniquesService.cancelTechniqueAssignment(subprocessId, item.id).subscribe({
      next: () => {
        this.loadAssignments(subprocessId);
      },
      error: (err) => {
        const message = err?.error?.message ?? 'No se pudo cancelar la asignacion.';
        this.error.set(message);
      }
    });
  }

  deleteAssignment(item: SubprocessTechnique) {
    const subprocessId = this.subprocessId();
    if (!subprocessId) {
      return;
    }

    this.error.set(null);
    this.techniquesService.deleteTechniqueAssignment(subprocessId, item.id).subscribe({
      next: () => {
        if (this.editingAssignmentId() === item.id) {
          this.resetAssignmentForm();
        }
        this.loadAssignments(subprocessId);
      },
      error: (err) => {
        const message = err?.error?.message ?? 'No se pudo eliminar la asignacion.';
        this.error.set(message);
      }
    });
  }

  createTechnique() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    this.techniquesService
      .createTechnique({
        name: value.name ?? '',
        description: value.description || null
      })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.createForm.reset({ name: '', description: '' });
          this.loadTechniques(response.id);
        },
        error: () => {
          this.saving.set(false);
          this.error.set('No se pudo crear la tecnica.');
        }
      });
  }

  private loadSubprocess(subprocessId: number) {
    this.processesService.getSubprocess(subprocessId).subscribe({
      next: (response) => {
        this.subprocess.set(response.subprocess);
      },
      error: () => {
        this.subprocess.set(null);
      }
    });
  }

  private loadProjectMembers(projectId: number) {
    this.projectsService.getProjectUsers(projectId).subscribe({
      next: (response) => {
        this.techMembers.set(response.techUsers ?? []);
        this.clientMembers.set(response.clientUsers ?? []);
      },
      error: () => {
        this.techMembers.set([]);
        this.clientMembers.set([]);
      }
    });
  }

  private loadTechniques(selectId?: number) {
    this.techniquesService.getTechniques().subscribe({
      next: (response) => {
        this.techniques.set(response.techniques ?? []);
        if (selectId) {
          this.assignmentForm.patchValue({ technique_id: selectId });
        }
      },
      error: () => {
        this.techniques.set([]);
      }
    });
  }

  private loadAssignments(subprocessId: number) {
    this.loading.set(true);
    this.error.set(null);

    this.techniquesService.getSubprocessTechniques(subprocessId).subscribe({
      next: (response) => {
        this.assignments.set(response.techniques ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.assignments.set([]);
        this.error.set('No se pudieron cargar las tecnicas.');
        this.loading.set(false);
      }
    });
  }

  private resetAssignmentForm() {
    this.editingAssignmentId.set(null);
    this.assignmentForm.reset({
      technique_id: null,
      tech_user_id: null,
      stakeholder_user_ids: [],
      scheduled_date: '',
      duration_minutes: 60,
      status: 'PLANNED'
    });
  }

  private toDatetimeLocal(value: string | null) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const pad = (num: number) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
