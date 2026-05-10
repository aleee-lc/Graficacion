import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsService, type Project } from '../../services/projects.service';
import { TraceabilityService, type FlowStatus, type Stakeholder } from '../../services/traceability.service';

@Component({
  selector: 'app-flow-project',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './flow-project.html'
})
export class FlowProjectPage {
  readonly projectId = signal<number | null>(null);
  readonly project = signal<Project | null>(null);
  readonly stakeholders = signal<Stakeholder[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly loading = signal(true);
  readonly savingProject = signal(false);
  readonly savingStakeholder = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly projectForm;
  readonly stakeholderForm;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly fb: FormBuilder,
    private readonly projectsService: ProjectsService,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      objective: ['', [Validators.required, Validators.minLength(12)]],
      scope: [''],
      description: [''],
      start_date: [''],
      end_date: ['']
    });

    this.stakeholderForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      role: ['', [Validators.required, Validators.minLength(2)]],
      type: ['external' as 'internal' | 'external', [Validators.required]],
      contact: ['']
    });

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('Invalid project id.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.refresh(id);
    });
  }

  saveProject() {
    const id = this.projectId();
    if (!id) {
      return;
    }
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const value = this.projectForm.getRawValue();
    this.error.set(null);
    this.success.set(null);
    this.savingProject.set(true);

    this.projectsService
      .updateProject(id, {
        name: value.name ?? '',
        objective: value.objective || null,
        scope: value.scope || null,
        description: value.description || null,
        start_date: value.start_date || null,
        end_date: value.end_date || null
      })
      .subscribe({
        next: () => {
          this.savingProject.set(false);
          this.success.set('Project context updated.');
          this.loadProject(id);
          this.loadFlowStatus(id);
        },
        error: (err) => {
          this.savingProject.set(false);
          this.error.set(err?.error?.message ?? 'Could not update project.');
        }
      });
  }

  addStakeholder() {
    const id = this.projectId();
    if (!id) {
      return;
    }
    if (this.stakeholderForm.invalid) {
      this.stakeholderForm.markAllAsTouched();
      return;
    }

    const value = this.stakeholderForm.getRawValue();
    this.error.set(null);
    this.success.set(null);
    this.savingStakeholder.set(true);

    this.traceabilityService
      .createStakeholder(id, {
        name: value.name ?? '',
        role: value.role ?? '',
        type: value.type ?? 'external',
        contact: value.contact || null
      })
      .subscribe({
        next: () => {
          this.savingStakeholder.set(false);
          this.stakeholderForm.reset({
            name: '',
            role: '',
            type: 'external',
            contact: ''
          });
          this.success.set('Stakeholder added.');
          this.loadStakeholders(id);
          this.loadFlowStatus(id);
        },
        error: (err) => {
          this.savingStakeholder.set(false);
          this.error.set(err?.error?.message ?? 'Could not add stakeholder.');
        }
      });
  }

  private refresh(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.loadProject(projectId);
    this.loadStakeholders(projectId);
    this.loadFlowStatus(projectId);
    this.loading.set(false);
  }

  private loadProject(projectId: number) {
    this.projectsService.getProject(projectId).subscribe({
      next: (response) => {
        this.project.set(response.project);
        this.projectForm.patchValue({
          name: response.project.name ?? '',
          objective: response.project.objective ?? '',
          scope: response.project.scope ?? '',
          description: response.project.description ?? '',
          start_date: response.project.start_date ?? '',
          end_date: response.project.end_date ?? ''
        });
      },
      error: () => {
        this.project.set(null);
        this.error.set('Could not load project.');
      }
    });
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

  canContinueToSessions() {
    return this.flowStatus()?.steps.step1.complete ?? false;
  }

  private loadFlowStatus(projectId: number) {
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
      },
      error: () => {
        this.flowStatus.set(null);
      }
    });
  }
}
