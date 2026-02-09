import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type Role = {
  id: number;
  name: string;
};

@Injectable({ providedIn: 'root' })
export class RolesService {
  constructor(private readonly http: HttpClient) {}

  getTechRoles() {
    return this.http.get<{ roles: Role[] }>(`${API_BASE_URL}/roles/tech`);
  }

  createTechRole(name: string) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/roles/tech`, { name });
  }

  updateTechRole(id: number, name: string) {
    return this.http.put<{ message: string }>(`${API_BASE_URL}/roles/tech/${id}`, { name });
  }

  deleteTechRole(id: number) {
    return this.http.delete<{ message: string }>(`${API_BASE_URL}/roles/tech/${id}`);
  }

  getStakeholderRoles() {
    return this.http.get<{ roles: Role[] }>(`${API_BASE_URL}/roles/stakeholders`);
  }

  createStakeholderRole(name: string) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/roles/stakeholders`, { name });
  }

  updateStakeholderRole(id: number, name: string) {
    return this.http.put<{ message: string }>(`${API_BASE_URL}/roles/stakeholders/${id}`, { name });
  }

  deleteStakeholderRole(id: number) {
    return this.http.delete<{ message: string }>(`${API_BASE_URL}/roles/stakeholders/${id}`);
  }
}
