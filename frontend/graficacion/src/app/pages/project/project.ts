import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsService, type Project, type ProjectUser } from '../../services/projects.service';
import { RolesService, type Role } from '../../services/roles.service';
import { UsersService, type UserSummary } from '../../services/users.service';

const requireNonEmptyArray = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as unknown;
  if (Array.isArray(value) && value.length > 0) {
    return null;
  }
  return { requiredArray: true };
};

@Component({
  selector: 'app-project',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './project.html',
  styleUrl: './project.css',
})
export class ProjectDetail {
  readonly project = signal<Project | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly projectId = signal<number | null>(null);
  readonly techMembers = signal<ProjectUser[]>([]);
  readonly clientMembers = signal<ProjectUser[]>([]);
  readonly membersLoading = signal(false);
  readonly membersError = signal<string | null>(null);

  readonly techRoles = signal<Role[]>([]);
  readonly clientRoles = signal<Role[]>([]);
  readonly rolesLoading = signal(false);
  readonly rolesError = signal<string | null>(null);

  readonly techSearch = signal('');
  readonly clientSearch = signal('');
  readonly techResults = signal<UserSummary[]>([]);
  readonly clientResults = signal<UserSummary[]>([]);
  readonly memberSaving = signal(false);
  readonly memberModalOpen = signal(false);
  readonly memberModalType = signal<'TECH' | 'CLIENT'>('TECH');
  readonly memberModalMode = signal<'existing' | 'create'>('existing');

  readonly techForm;
  readonly clientForm;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly fb: FormBuilder
  ) {
    this.techForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.minLength(7)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      techRoleIds: this.fb.control<number[]>([], [requireNonEmptyArray])
    });

    this.clientForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.minLength(7)]],
      company: ['', [Validators.required, Validators.minLength(2)]],
      stakeholderRoleId: this.fb.control<number | null>(null, [Validators.required])
    });

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('Proyecto invalido.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.fetchProject(id);
      this.loadMembers(id);
    });

    this.loadProjects();
    this.loadRoles();
  }

  setTechSearch(value: string) {
    this.techSearch.set(value);
  }

  setClientSearch(value: string) {
    this.clientSearch.set(value);
  }

  openMemberModal(type: 'TECH' | 'CLIENT') {
    this.memberModalType.set(type);
    this.memberModalMode.set('existing');
    this.membersError.set(null);
    this.memberModalOpen.set(true);
  }

  closeMemberModal() {
    this.memberModalOpen.set(false);
    this.memberModalMode.set('existing');
    this.memberSaving.set(false);
    this.membersError.set(null);
    this.techSearch.set('');
    this.clientSearch.set('');
    this.techResults.set([]);
    this.clientResults.set([]);
    this.techForm.reset({
      name: '',
      email: '',
      mobile: '',
      password: '',
      techRoleIds: []
    });
    this.clientForm.reset({
      name: '',
      email: '',
      mobile: '',
      company: '',
      stakeholderRoleId: null
    });
  }

  setMemberModalMode(mode: 'existing' | 'create') {
    this.memberModalMode.set(mode);
    this.membersError.set(null);
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

  addTechMember(user: UserSummary) {
    if (this.isTechMember(user.id)) {
      this.membersError.set('El usuario ya pertenece al proyecto.');
      return;
    }
    this.addMember(user.id);
  }

  addClientMember(user: UserSummary) {
    if (this.isClientMember(user.id)) {
      this.membersError.set('El usuario ya pertenece al proyecto.');
      return;
    }
    this.addMember(user.id);
  }

  toggleTechRole(roleId: number) {
    const control = this.techForm.get('techRoleIds');
    const current = (control?.value as number[]) ?? [];
    const exists = current.includes(roleId);
    const next = exists ? current.filter((id) => id !== roleId) : [...current, roleId];
    control?.setValue(next);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  isTechRoleSelected(roleId: number) {
    const current = (this.techForm.get('techRoleIds')?.value as number[]) ?? [];
    return current.includes(roleId);
  }

  createTechMember() {
    if (this.techForm.invalid) {
      this.techForm.markAllAsTouched();
      return;
    }

    const value = this.techForm.getRawValue();
    this.memberSaving.set(true);
    this.membersError.set(null);

    this.usersService.createUser({
      name: value.name ?? '',
      email: value.email ?? '',
      mobile: value.mobile ?? '',
      password: value.password ?? '',
      user_type: 'TECH',
      techRoleIds: (value.techRoleIds as number[]) ?? []
    }).subscribe({
      next: (response) => {
        this.addMember(response.id);
        this.techForm.reset({
          name: '',
          email: '',
          mobile: '',
          password: '',
          techRoleIds: []
        });
      },
      error: (err) => {
        this.memberSaving.set(false);
        const message = err?.error?.message ?? 'No se pudo crear el usuario tecnico.';
        this.membersError.set(message);
      }
    });
  }

  createClientMember() {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const value = this.clientForm.getRawValue();
    this.memberSaving.set(true);
    this.membersError.set(null);

    this.usersService.createUser({
      name: value.name ?? '',
      email: value.email ?? '',
      mobile: value.mobile ?? '',
      company: value.company ?? '',
      stakeholder_role_id: value.stakeholderRoleId ?? undefined,
      user_type: 'CLIENT'
    }).subscribe({
      next: (response) => {
        this.addMember(response.id);
        this.clientForm.reset({
          name: '',
          email: '',
          mobile: '',
          company: '',
          stakeholderRoleId: null
        });
      },
      error: (err) => {
        this.memberSaving.set(false);
        const message = err?.error?.message ?? 'No se pudo crear el stakeholder.';
        this.membersError.set(message);
      }
    });
  }

  private fetchProject(id: number) {
    this.loading.set(true);
    this.error.set(null);

    this.projectsService.getProject(id).subscribe({
      next: (response) => {
        this.project.set(response.project);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el proyecto.');
        this.loading.set(false);
      }
    });
  }

  private loadProjects() {
    this.projectsService.getProjects().subscribe({
      next: (response) => {
        this.projects.set(response.projects ?? []);
      },
      error: () => {
        this.projects.set([]);
      }
    });
  }

  private loadRoles() {
    this.rolesLoading.set(true);
    this.rolesError.set(null);

    this.rolesService.getTechRoles().subscribe({
      next: (response) => {
        this.techRoles.set(response.roles ?? []);
        this.rolesLoading.set(false);
      },
      error: () => {
        this.techRoles.set([]);
        this.rolesError.set('No se pudieron cargar los roles tecnicos.');
        this.rolesLoading.set(false);
      }
    });

    this.rolesService.getStakeholderRoles().subscribe({
      next: (response) => {
        this.clientRoles.set(response.roles ?? []);
      },
      error: () => {
        this.clientRoles.set([]);
        this.rolesError.set('No se pudieron cargar los roles de stakeholders.');
      }
    });
  }

  private loadMembers(projectId: number) {
    this.membersLoading.set(true);
    this.membersError.set(null);

    this.projectsService.getProjectUsers(projectId).subscribe({
      next: (response) => {
        this.techMembers.set(response.techUsers ?? []);
        this.clientMembers.set(response.clientUsers ?? []);
        this.membersLoading.set(false);
      },
      error: () => {
        this.techMembers.set([]);
        this.clientMembers.set([]);
        this.membersError.set('No se pudieron cargar los miembros.');
        this.membersLoading.set(false);
      }
    });
  }

  private addMember(userId: number) {
    const projectId = this.projectId();
    if (!projectId) {
      this.memberSaving.set(false);
      return;
    }

    this.memberSaving.set(true);
    this.membersError.set(null);

    this.projectsService.addProjectUser(projectId, userId).subscribe({
      next: () => {
        this.memberSaving.set(false);
        this.techResults.set([]);
        this.clientResults.set([]);
        this.techSearch.set('');
        this.clientSearch.set('');
        this.loadMembers(projectId);
        this.closeMemberModal();
      },
      error: (err) => {
        this.memberSaving.set(false);
        const message = err?.error?.message ?? 'No se pudo agregar el usuario al proyecto.';
        this.membersError.set(message);
      }
    });
  }

  private isTechMember(userId: number) {
    return this.techMembers().some((member) => member.id === userId);
  }

  private isClientMember(userId: number) {
    return this.clientMembers().some((member) => member.id === userId);
  }
}
