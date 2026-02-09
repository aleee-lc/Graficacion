import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type UserSummary = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  userType: 'TECH' | 'CLIENT';
  companyName?: string | null;
  roleName?: string | null;
  stakeholderRoleId?: number | null;
  techRoles?: { id: number; name: string }[];
};

export type CreateUserPayload = {
  name: string;
  email: string;
  mobile: string;
  user_type: 'TECH' | 'CLIENT';
  password?: string;
  company?: string;
  role?: string;
  techRoleIds?: number[];
  stakeholder_role_id?: number;
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private readonly http: HttpClient) {}

  searchUsers(type: 'TECH' | 'CLIENT', query: string) {
    const params = new HttpParams()
      .set('type', type)
      .set('query', query);
    return this.http.get<{ users: UserSummary[] }>(`${API_BASE_URL}/users`, { params });
  }

  createUser(payload: CreateUserPayload) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/users`, payload);
  }
}
