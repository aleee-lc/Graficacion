import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProcessesService, type Process } from '../../services/processes.service';
import { ProjectsService, type Project } from '../../services/projects.service';

@Component({
  selector: 'app-processes',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './processes.html',
  styleUrl: './processes.css',
})
export class ProcessesPage {
  readonly projectId = signal<number | null>(null);
  readonly project = signal<Project | null>(null);
  readonly processes = signal<Process[]>([]);
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
      const id = Number(params.get('projectId'));
      if (Number.isNaN(id)) {
        this.error.set('Proyecto invalido.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.loadProject(id);
      this.loadProcesses(id);
    });
  }

  createProcess() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    this.processesService.createProcess(projectId, {
      name: value.name ?? '',
      description: value.description || null
    }).subscribe({
      next: (response) => {
        this.processes.update((current) => [
          {
            id: response.id,
            project_id: projectId,
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
        this.error.set('No se pudo crear el proceso.');
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

  private loadProcesses(projectId: number) {
    this.loading.set(true);
    this.error.set(null);

    this.processesService.getProcesses(projectId).subscribe({
      next: (response) => {
        this.processes.set(response.processes ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.processes.set([]);
        this.error.set('No se pudieron cargar los procesos.');
        this.loading.set(false);
      }
    });
  }
}
