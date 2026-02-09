import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProcessesService, type Subprocess } from '../../services/processes.service';
import { TechniquesService, type Technique, type SubprocessTechnique } from '../../services/techniques.service';

@Component({
  selector: 'app-techniques',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './techniques.html',
  styleUrl: './techniques.css',
})
export class TechniquesPage {
  readonly projectId = signal<number | null>(null);
  readonly subprocessId = signal<number | null>(null);
  readonly subprocess = signal<Subprocess | null>(null);
  readonly techniques = signal<Technique[]>([]);
  readonly assignments = signal<SubprocessTechnique[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly assigning = signal(false);
  readonly selectedTechniqueId = signal<number | null>(null);

  readonly createForm;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly processesService: ProcessesService,
    private readonly techniquesService: TechniquesService,
    private readonly fb: FormBuilder
  ) {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['']
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
      this.loadTechniques();
      this.loadAssignments(subprocessId);
    });
  }

  setSelectedTechnique(value: string) {
    const id = Number(value);
    this.selectedTechniqueId.set(Number.isNaN(id) ? null : id);
  }

  assignTechnique() {
    const subprocessId = this.subprocessId();
    const techniqueId = this.selectedTechniqueId();
    if (!subprocessId || !techniqueId) {
      this.error.set('Selecciona una tecnica antes de asignar.');
      return;
    }

    this.assigning.set(true);
    this.error.set(null);

    this.techniquesService.assignTechnique(subprocessId, { technique_id: techniqueId }).subscribe({
      next: () => {
        this.assigning.set(false);
        this.loadAssignments(subprocessId);
      },
      error: (err) => {
        this.assigning.set(false);
        const message = err?.error?.message ?? 'No se pudo asignar la tecnica.';
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

    this.techniquesService.createTechnique({
      name: value.name ?? '',
      description: value.description || null
    }).subscribe({
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

  private loadTechniques(selectId?: number) {
    this.techniquesService.getTechniques().subscribe({
      next: (response) => {
        this.techniques.set(response.techniques ?? []);
        if (selectId) {
          this.selectedTechniqueId.set(selectId);
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
}
