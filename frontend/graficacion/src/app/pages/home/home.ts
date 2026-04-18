import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProjectsService, type Project } from '../../services/projects.service';
import { RolesService } from '../../services/roles.service';
import { UsersService, type UserSummary } from '../../services/users.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly projects = signal<Project[]>([]);
  readonly rolesCount = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly wizardOpen = signal(false);
  readonly wizardStep = signal(1);
  readonly wizardError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly techMode = signal<'existing' | 'create'>('create');
  readonly clientMode = signal<'existing' | 'create'>('create');
  readonly techResults = signal<UserSummary[]>([]);
  readonly clientResults = signal<UserSummary[]>([]);
  readonly selectedTech = signal<UserSummary | null>(null);
  readonly selectedClient = signal<UserSummary | null>(null);
  readonly techSearch = signal('');
  readonly clientSearch = signal('');

  readonly projectsCount = computed(() => this.projects().length);
  readonly form;
  readonly modalOpen = this.wizardOpen;

  constructor(
    private readonly fb: FormBuilder,
    private readonly projectsService: ProjectsService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService
  ) {
    this.form = this.fb.group({
      project: this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        description: [''],
        start_date: [''],
        end_date: ['']
      }),
      tech: this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        mobile: ['', [Validators.required, Validators.minLength(7)]],
        password: ['', [Validators.required, Validators.minLength(8)]]
      }),
      client: this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        mobile: ['', [Validators.required, Validators.minLength(7)]],
        company: ['', [Validators.required, Validators.minLength(2)]],
        role: ['', [Validators.required, Validators.minLength(2)]]
      })
    });

    this.loadDashboard();
  }

  openWizard() {
    this.wizardOpen.set(true);
    this.wizardStep.set(1);
    this.wizardError.set(null);
    this.techMode.set('create');
    this.clientMode.set('create');
    this.techResults.set([]);
    this.clientResults.set([]);
    this.selectedTech.set(null);
    this.selectedClient.set(null);
    this.techSearch.set('');
    this.clientSearch.set('');
  }

  closeWizard() {
    this.wizardOpen.set(false);
    this.wizardError.set(null);
    this.saving.set(false);
    this.techResults.set([]);
    this.clientResults.set([]);
    this.selectedTech.set(null);
    this.selectedClient.set(null);
    this.techSearch.set('');
    this.clientSearch.set('');
    this.form.reset({
      project: { name: '', description: '', start_date: '', end_date: '' },
      tech: { name: '', email: '', mobile: '', password: '' },
      client: { name: '', email: '', mobile: '', company: '', role: '' }
    });
  }

  // Backward-compatible aliases used by the current template.
  openModal() {
    this.openWizard();
  }

  closeModal() {
    this.closeWizard();
  }

  submitProject() {
    const projectGroup = this.form.get('project');
    if (projectGroup?.invalid) {
      projectGroup.markAllAsTouched();
      return;
    }

    const project = this.form.getRawValue().project;
    if (!project) {
      return;
    }

    this.saving.set(true);
    this.wizardError.set(null);

    this.projectsService
      .createProject({
        name: project.name ?? '',
        description: project.description || null,
        start_date: project.start_date || null,
        end_date: project.end_date || null
      })
      .subscribe({
        next: (response) => {
          this.projects.update((current) => [
            {
              id: response.id,
              name: project.name ?? '',
              description: project.description || null,
              start_date: project.start_date || null,
              end_date: project.end_date || null
            },
            ...current
          ]);
          this.saving.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.saving.set(false);
          const message =
            err?.error?.message ??
            'No se pudo crear el proyecto. Revisa los datos e intenta de nuevo.';
          this.wizardError.set(message);
        }
      });
  }

  setTechMode(mode: 'existing' | 'create') {
    this.techMode.set(mode);
    this.selectedTech.set(null);
    this.techResults.set([]);
    this.wizardError.set(null);
  }

  setClientMode(mode: 'existing' | 'create') {
    this.clientMode.set(mode);
    this.selectedClient.set(null);
    this.clientResults.set([]);
    this.wizardError.set(null);
  }

  setTechSearch(value: string) {
    this.techSearch.set(value);
  }

  setClientSearch(value: string) {
    this.clientSearch.set(value);
  }

  searchTech() {
    const query = this.techSearch().trim();
    if (!query) {
      this.techResults.set([]);
      return;
    }

    this.usersService.searchUsers('TECH', query).subscribe({
      next: (response) => {
        this.techResults.set(response.users ?? []);
      },
      error: () => {
        this.techResults.set([]);
      }
    });
  }

  searchClient() {
    const query = this.clientSearch().trim();
    if (!query) {
      this.clientResults.set([]);
      return;
    }

    this.usersService.searchUsers('CLIENT', query).subscribe({
      next: (response) => {
        this.clientResults.set(response.users ?? []);
      },
      error: () => {
        this.clientResults.set([]);
      }
    });
  }

  selectTech(user: UserSummary) {
    this.selectedTech.set(user);
    this.wizardError.set(null);
  }

  selectClient(user: UserSummary) {
    this.selectedClient.set(user);
    this.wizardError.set(null);
  }

  nextStep() {
    const current = this.wizardStep();
    this.wizardError.set(null);

    if (current === 1 && this.form.get('project')?.invalid) {
      this.form.get('project')?.markAllAsTouched();
      return;
    }

    if (current === 2) {
      if (this.techMode() === 'existing' && !this.selectedTech()) {
        this.wizardError.set('Selecciona un responsable técnico existente.');
        return;
      }
      if (this.techMode() === 'create' && this.form.get('tech')?.invalid) {
        this.form.get('tech')?.markAllAsTouched();
        return;
      }
    }

    if (current === 3) {
      if (this.clientMode() === 'existing' && !this.selectedClient()) {
        this.wizardError.set('Selecciona un responsable del cliente existente.');
        return;
      }
      if (this.clientMode() === 'create' && this.form.get('client')?.invalid) {
        this.form.get('client')?.markAllAsTouched();
        return;
      }
    }

    this.wizardStep.set(Math.min(4, current + 1));
  }

  prevStep() {
    const current = this.wizardStep();
    this.wizardError.set(null);
    this.wizardStep.set(Math.max(1, current - 1));
  }

  submitWizard() {
    if (this.form.get('project')?.invalid) {
      this.form.get('project')?.markAllAsTouched();
      return;
    }

    if (this.techMode() === 'existing' && !this.selectedTech()) {
      this.wizardError.set('Selecciona un responsable técnico existente.');
      return;
    }

    if (this.techMode() === 'create' && this.form.get('tech')?.invalid) {
      this.form.get('tech')?.markAllAsTouched();
      return;
    }

    if (this.clientMode() === 'existing' && !this.selectedClient()) {
      this.wizardError.set('Selecciona un responsable del cliente existente.');
      return;
    }

    if (this.clientMode() === 'create' && this.form.get('client')?.invalid) {
      this.form.get('client')?.markAllAsTouched();
      return;
    }

    const { project, tech, client } = this.form.getRawValue();
    if (!project || !tech || !client) {
      return;
    }

    this.saving.set(true);
    this.wizardError.set(null);

    const techOwner =
      this.techMode() === 'existing'
        ? { mode: 'existing' as const, userId: this.selectedTech()!.id }
        : {
            mode: 'create' as const,
            name: tech.name ?? '',
            email: tech.email ?? '',
            mobile: tech.mobile ?? '',
            password: tech.password ?? ''
          };

    const clientOwner =
      this.clientMode() === 'existing'
        ? { mode: 'existing' as const, userId: this.selectedClient()!.id }
        : {
            mode: 'create' as const,
            name: client.name ?? '',
            email: client.email ?? '',
            mobile: client.mobile ?? '',
            company: client.company ?? '',
            role: client.role ?? ''
          };

    const payload = {
      project: {
        name: project.name ?? '',
        description: project.description || null,
        start_date: project.start_date || null,
        end_date: project.end_date || null
      },
      techOwner,
      clientOwner
    };

    this.projectsService.createProjectWizard(payload).subscribe({
      next: (response) => {
        this.projects.update((current) => [
          {
            id: response.projectId,
            ...payload.project
          },
          ...current
        ]);
        this.saving.set(false);
        this.closeWizard();
      },
      error: (err) => {
        this.saving.set(false);
        const message =
          err?.error?.message ??
          'No se pudo crear el proyecto. Revisa los datos e intenta de nuevo.';
        this.wizardError.set(message);
      }
    });
  }

  private loadDashboard() {
    this.loading.set(true);
    this.error.set(null);

    this.projectsService.getProjects().subscribe({
      next: (response) => {
        this.projects.set(response.projects ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los proyectos.');
        this.loading.set(false);
      }
    });

    this.rolesService.getTechRoles().subscribe({
      next: (response) => {
        this.rolesCount.set(response.roles.length);
      },
      error: () => {
        this.rolesCount.set(0);
      }
    });
  }
}





