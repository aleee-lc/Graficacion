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
  tech_user_name?: string | null;
  tech_user_email?: string | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  name: string;
  description: string | null;
  stakeholders?: Array<{
    id: number;
    name: string | null;
    email: string | null;
  }>;
};

export type TechniqueAssignmentPayload = {
  technique_id: number;
  tech_user_id?: number | null;
  stakeholder_user_ids?: number[];
  scheduled_date?: string | null;
  duration_minutes?: number | null;
  status?: 'PLANNED' | 'DONE' | 'CANCELLED';
};

export type TechniqueEvidence = {
  id: number;
  subprocess_technique_id: number;
  project_id: number;
  uploaded_by_user_id: number;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  bucket: string;
  object_path: string;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
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

  updateTechnique(id: number, payload: { name: string; description?: string | null }) {
    return this.http.put<{ message: string }>(`${API_BASE_URL}/techniques/${id}`, payload);
  }

  deleteTechnique(id: number) {
    return this.http.delete<{ message: string }>(`${API_BASE_URL}/techniques/${id}`);
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

  createTechniqueAssignment(subprocessId: number, payload: TechniqueAssignmentPayload) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/subprocesses/${subprocessId}/techniques`, payload);
  }

  updateTechniqueAssignment(
    subprocessId: number,
    assignmentId: number,
    payload: Partial<TechniqueAssignmentPayload>
  ) {
    return this.http.put<{ message: string }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}`,
      payload
    );
  }

  cancelTechniqueAssignment(subprocessId: number, assignmentId: number) {
    return this.http.patch<{ message: string }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}/cancel`,
      {}
    );
  }

  deleteTechniqueAssignment(subprocessId: number, assignmentId: number) {
    return this.http.delete<{ message: string }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}`
    );
  }

  getTechniqueEvidences(subprocessId: number, assignmentId: number) {
    return this.http.get<{ evidences: TechniqueEvidence[] }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}/evidences`
    );
  }

  uploadTechniqueEvidences(
    subprocessId: number,
    assignmentId: number,
    files: File[],
    notes?: string | null
  ) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    if (notes && notes.trim().length > 0) {
      formData.append('notes', notes.trim());
    }

    return this.http.post<{ evidences: TechniqueEvidence[] }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}/evidences`,
      formData
    );
  }

  createTechniqueEvidenceSignedUrl(
    subprocessId: number,
    assignmentId: number,
    evidenceId: number,
    expiresIn?: number
  ) {
    return this.http.post<{ url: string; expires_in: number }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}/evidences/${evidenceId}/signed-url`,
      expiresIn ? { expires_in: expiresIn } : {}
    );
  }

  deleteTechniqueEvidence(subprocessId: number, assignmentId: number, evidenceId: number) {
    return this.http.delete<{ message: string }>(
      `${API_BASE_URL}/subprocesses/${subprocessId}/techniques/${assignmentId}/evidences/${evidenceId}`
    );
  }
}
