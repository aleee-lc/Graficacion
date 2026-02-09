import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProcessesService, type Process, type Subprocess } from '../../services/processes.service';
import { ProjectsService, type Project } from '../../services/projects.service';

@Component({
  selector: 'app-subprocesses',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './subprocesses.html',
  styleUrl: './subprocesses.css',
})
export class SubprocessesPage {
  readonly projectId = signal<number | null>(null);
  readonly processId = signal<number | null>(null);
  readonly project = signal<Project | null>(null);
  readonly process = signal<Process | null>(null);
  readonly subprocesses = signal<Subprocess[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly form;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectsService: ProjectsService,
    private readonly processesService: ProcessesService,
    private readonly fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['']
    });

    this.route.paramMap.subscribe((params) => {
      const projectId = Number(params.get('projectId'));
      const processId = Number(params.get('processId'));
      if (Number.isNaN(projectId) || Number.isNaN(processId)) {
        this.error.set('Parametros invalidos.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(projectId);
      this.processId.set(processId);
      this.loadProject(projectId);
      this.loadProcess(processId);
      this.loadSubprocesses(processId);
    });
  }

  createSubprocess() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const processId = this.processId();
    if (!processId) {
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    this.processesService.createSubprocess(processId, {
      name: value.name ?? '',
      description: value.description || null
    }).subscribe({
      next: (response) => {
        this.subprocesses.update((current) => [
          {
            id: response.id,
            process_id: processId,
            name: value.name ?? '',
            description: value.description || null
          },
          ...current
        ]);
        this.saving.set(false);
        this.form.reset({ name: '', description: '' });
      },
      error: () => {
        this.saving.set(false);
        this.error.set('No se pudo crear el subproceso.');
      }
    });
  }

  private loadProject(projectId: number) {
    this.projectsService.getProject(projectId).subscribe({
      next: (response) => {
        this.project.set(response.project);
      },
      error: () => {
        this.project.set(null);
      }
    });
  }

  private loadProcess(processId: number) {
    this.processesService.getProcess(processId).subscribe({
      next: (response) => {
        this.process.set(response.process);
      },
      error: () => {
        this.process.set(null);
      }
    });
  }

  private loadSubprocesses(processId: number) {
    this.loading.set(true);
    this.error.set(null);

    this.processesService.getSubprocesses(processId).subscribe({
      next: (response) => {
        this.subprocesses.set(response.subprocesses ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.subprocesses.set([]);
        this.error.set('No se pudieron cargar los subprocesos.');
        this.loading.set(false);
      }
    });
  }
}
