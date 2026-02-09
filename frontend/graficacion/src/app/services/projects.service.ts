import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type Project = {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type ProjectUser = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: 'TECH' | 'CLIENT';
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
};

export type CreateProjectPayload = {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type WizardPayload = {
  project: CreateProjectPayload;
  techOwner:
    | { mode: 'existing'; userId: number }
    | {
        mode: 'create';
        name: string;
        email: string;
        mobile: string;
        password: string;
      };
  clientOwner:
    | { mode: 'existing'; userId: number }
    | {
        mode: 'create';
        name: string;
        email: string;
        mobile: string;
        company: string;
        role: string;
      };
};

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  constructor(private readonly http: HttpClient) {}

  getProjects() {
    return this.http.get<{ projects: Project[] }>(`${API_BASE_URL}/projects`);
  }

  getProject(id: number) {
    return this.http.get<{ project: Project }>(`${API_BASE_URL}/projects/${id}`);
  }

  getProjectUsers(id: number) {
    return this.http.get<{ techUsers: ProjectUser[]; clientUsers: ProjectUser[] }>(
      `${API_BASE_URL}/projects/${id}/users`
    );
  }

  addProjectUser(projectId: number, userId: number) {
    return this.http.post<{ message: string }>(`${API_BASE_URL}/projects/${projectId}/users`, {
      userId
    });
  }

  createProject(payload: CreateProjectPayload) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/projects`, payload);
  }

  createProjectWizard(payload: WizardPayload) {
    return this.http.post<{
      projectId: number;
      techUserId: number;
      clientUserId: number;
    }>(`${API_BASE_URL}/projects/wizard`, payload);
  }
}
