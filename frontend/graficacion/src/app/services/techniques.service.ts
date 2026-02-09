import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type Technique = {
  id: number;
  name: string;
  description: string | null;
};

export type SubprocessTechnique = {
  id: number;
  subprocess_id: number;
  technique_id: number;
  tech_user_id: number | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  name: string;
  description: string | null;
};

@Injectable({ providedIn: 'root' })
export class TechniquesService {
  constructor(private readonly http: HttpClient) {}

  getTechniques() {
    return this.http.get<{ techniques: Technique[] }>(`${API_BASE_URL}/techniques`);
  }

  createTechnique(payload: { name: string; description?: string | null }) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/techniques`, payload);
  }

  getSubprocessTechniques(subprocessId: number) {
    return this.http.get<{ techniques: SubprocessTechnique[] }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques`
    );
  }

  assignTechnique(subprocessId: number, payload: { technique_id: number }) {
    return this.http.post<{ id: number }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques`,
      payload
    );
  }
}
