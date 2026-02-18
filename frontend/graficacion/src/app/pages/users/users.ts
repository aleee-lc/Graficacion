import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors
} from '@angular/forms';
import { RolesService, type Role } from '../../services/roles.service';
import { UsersService, type CreateUserPayload, type UserSummary } from '../../services/users.service';

type UserType = 'TECH' | 'CLIENT';

const requireNonEmptyArray = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as unknown;
  if (Array.isArray(value) && value.length > 0) {
    return null;
  }
  return { requiredArray: true };
};

@Component({
  selector: 'app-users',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users {
  readonly activeUserType = signal<UserType>('TECH');
  readonly createUserType = signal<UserType>('TECH');
  readonly createModalOpen = signal(false);
  readonly activeRoleType = signal<UserType>('TECH');

  readonly searchTerm = signal('');
  readonly users = signal<UserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly saving = signal(false);

  readonly techRoles = signal<Role[]>([]);
  readonly clientRoles = signal<Role[]>([]);
  readonly rolesLoading = signal(false);
  readonly rolesError = signal<string | null>(null);
  readonly roleSaving = signal(false);
  readonly roleActionId = signal<number | null>(null);
  readonly editingRoleId = signal<number | null>(null);
  readonly editingRoleName = signal('');
  readonly newRoleName = signal('');

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.minLength(7)]],
      password: [''],
      company: [''],
      techRoleIds: this.fb.control<number[]>([]),
      stakeholderRoleId: this.fb.control<number | null>(null)
    });

    this.applyTypeValidators(this.createUserType());
    this.loadUsers();
    this.loadRoles();
  }

  setUserType(type: UserType) {
    if (this.activeUserType() === type) {
      return;
    }
    this.activeUserType.set(type);
    this.searchTerm.set('');
    this.error.set(null);
    this.loadUsers();
  }

  setSearch(value: string) {
    this.searchTerm.set(value);
  }

  setRoleType(type: UserType) {
    if (this.activeRoleType() === type) {
      return;
    }
    this.activeRoleType.set(type);
    this.rolesError.set(null);
    this.roleActionId.set(null);
    this.editingRoleId.set(null);
    this.editingRoleName.set('');
    this.newRoleName.set('');
  }

  openCreateModal() {
    const selectedType = this.activeUserType();
    this.createModalOpen.set(true);
    this.success.set(null);
    this.error.set(null);
    this.createUserType.set(selectedType);
    this.resetForm();
    this.applyTypeValidators(selectedType);
  }

  closeCreateModal() {
    this.createModalOpen.set(false);
    this.saving.set(false);
    this.error.set(null);
    this.resetForm();
  }

  setCreateUserType(type: UserType) {
    if (this.createUserType() === type) {
      return;
    }
    this.createUserType.set(type);
    this.applyTypeValidators(type);
    this.error.set(null);
  }

  setNewRoleName(value: string) {
    this.newRoleName.set(value);
  }

  setEditingRoleName(value: string) {
    this.editingRoleName.set(value);
  }

  toggleTechRole(roleId: number) {
    const control = this.form.get('techRoleIds');
    const current = (control?.value as number[]) ?? [];
    const exists = current.includes(roleId);
    const next = exists ? current.filter((id) => id !== roleId) : [...current, roleId];
    control?.setValue(next);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  isTechRoleSelected(roleId: number) {
    const current = (this.form.get('techRoleIds')?.value as number[]) ?? [];
    return current.includes(roleId);
  }

  loadUsers() {
    this.loading.set(true);
    this.error.set(null);

    this.usersService.searchUsers(this.activeUserType(), this.searchTerm().trim()).subscribe({
      next: (response) => {
        this.users.set(response.users ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.users.set([]);
        this.error.set('No se pudieron cargar los usuarios.');
        this.loading.set(false);
      }
    });
  }

  submitUser() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    const type = this.createUserType();
    const payload: CreateUserPayload = {
      name: value.name?.trim() ?? '',
      email: value.email?.trim() ?? '',
      mobile: value.mobile?.trim() ?? '',
      user_type: type
    };

    if (type === 'TECH') {
      payload.password = value.password ?? '';
      payload.techRoleIds = (value.techRoleIds as number[]) ?? [];
    } else {
      payload.company = value.company ?? '';
      payload.stakeholder_role_id = value.stakeholderRoleId ?? undefined;
    }

    this.usersService.createUser(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set('Usuario creado correctamente.');
        this.closeCreateModal();
        this.loadUsers();
      },
      error: (err) => {
        this.saving.set(false);
        const message = err?.error?.message ?? 'No se pudo crear el usuario.';
        this.error.set(message);
      }
    });
  }

  createRole() {
    const name = this.newRoleName().trim();
    if (!name) {
      return;
    }

    this.roleSaving.set(true);
    this.rolesError.set(null);

    const request =
      this.activeRoleType() === 'TECH'
        ? this.rolesService.createTechRole(name)
        : this.rolesService.createStakeholderRole(name);

    request.subscribe({
      next: () => {
        this.newRoleName.set('');
        this.roleSaving.set(false);
        this.loadRoles();
      },
      error: () => {
        this.roleSaving.set(false);
        this.rolesError.set('No se pudo crear el rol.');
      }
    });
  }

  startEditRole(role: Role) {
    this.editingRoleId.set(role.id);
    this.editingRoleName.set(role.name);
    this.rolesError.set(null);
  }

  cancelEditRole() {
    this.editingRoleId.set(null);
    this.editingRoleName.set('');
  }

  saveRole() {
    const roleId = this.editingRoleId();
    const name = this.editingRoleName().trim();

    if (!roleId || !name) {
      return;
    }

    this.roleActionId.set(roleId);
    this.rolesError.set(null);

    const request =
      this.activeRoleType() === 'TECH'
        ? this.rolesService.updateTechRole(roleId, name)
        : this.rolesService.updateStakeholderRole(roleId, name);

    request.subscribe({
      next: () => {
        this.roleActionId.set(null);
        this.cancelEditRole();
        this.loadRoles();
      },
      error: () => {
        this.roleActionId.set(null);
        this.rolesError.set('No se pudo actualizar el rol.');
      }
    });
  }

  deleteRole(roleId: number) {
    this.roleActionId.set(roleId);
    this.rolesError.set(null);

    const request =
      this.activeRoleType() === 'TECH'
        ? this.rolesService.deleteTechRole(roleId)
        : this.rolesService.deleteStakeholderRole(roleId);

    request.subscribe({
      next: () => {
        this.roleActionId.set(null);
        if (this.editingRoleId() === roleId) {
          this.cancelEditRole();
        }
        this.loadRoles();
      },
      error: (err) => {
        this.roleActionId.set(null);
        const message = err?.error?.message ?? 'No se pudo eliminar el rol.';
        this.rolesError.set(message);
      }
    });
  }

  private loadRoles() {
    this.rolesLoading.set(true);
    this.rolesError.set(null);

    let techLoaded = false;
    let clientLoaded = false;

    const finalize = () => {
      if (techLoaded && clientLoaded) {
        this.rolesLoading.set(false);
      }
    };

    this.rolesService.getTechRoles().subscribe({
      next: (response) => {
        this.techRoles.set(response.roles ?? []);
        techLoaded = true;
        finalize();
      },
      error: () => {
        this.techRoles.set([]);
        this.rolesError.set('No se pudieron cargar los roles tecnicos.');
        techLoaded = true;
        finalize();
      }
    });

    this.rolesService.getStakeholderRoles().subscribe({
      next: (response) => {
        this.clientRoles.set(response.roles ?? []);
        clientLoaded = true;
        finalize();
      },
      error: () => {
        this.clientRoles.set([]);
        this.rolesError.set('No se pudieron cargar los roles de stakeholders.');
        clientLoaded = true;
        finalize();
      }
    });
  }

  private applyTypeValidators(type: UserType) {
    const password = this.form.get('password');
    const company = this.form.get('company');
    const techRoleIds = this.form.get('techRoleIds');
    const stakeholderRoleId = this.form.get('stakeholderRoleId');

    if (type === 'TECH') {
      password?.setValidators([Validators.required, Validators.minLength(8)]);
      company?.clearValidators();
      stakeholderRoleId?.clearValidators();
      techRoleIds?.setValidators([requireNonEmptyArray]);
      this.form.patchValue({ company: '', stakeholderRoleId: null });
    } else {
      password?.clearValidators();
      company?.setValidators([Validators.required, Validators.minLength(2)]);
      stakeholderRoleId?.setValidators([Validators.required]);
      techRoleIds?.clearValidators();
      this.form.patchValue({ password: '', techRoleIds: [] });
    }

    password?.updateValueAndValidity();
    company?.updateValueAndValidity();
    techRoleIds?.updateValueAndValidity();
    stakeholderRoleId?.updateValueAndValidity();
  }

  private resetForm() {
    this.form.reset({
      name: '',
      email: '',
      mobile: '',
      password: '',
      company: '',
      techRoleIds: [],
      stakeholderRoleId: null
    });
  }
}
