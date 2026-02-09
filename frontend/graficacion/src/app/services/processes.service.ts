import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type Process = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
};

export type Subprocess = {
  id: number;
  process_id: number;
  name: string;
  description: string | null;
};

export type CreateProcessPayload = {
  name: string;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ProcessesService {
  constructor(private readonly http: HttpClient) {}

  getProcesses(projectId: number) {
    return this.http.get<{ processes: Process[] }>(`${API_BASE_URL}/projects/${projectId}/processes`);
  }

  createProcess(projectId: number, payload: CreateProcessPayload) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/projects/${projectId}/processes`, payload);
  }

  getProcess(processId: number) {
    return this.http.get<{ process: Process }>(`${API_BASE_URL}/processes/${processId}`);
  }

  getSubprocesses(processId: number) {
    return this.http.get<{ subprocesses: Subprocess[] }>(`${API_BASE_URL}/processes/${processId}/subprocesses`);
  }

  createSubprocess(processId: number, payload: CreateProcessPayload) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/processes/${processId}/subprocesses`, payload);
  }

  getSubprocess(subprocessId: number) {
    return this.http.get<{ subprocess: Subprocess }>(`${API_BASE_URL}/subprocesses/${subprocessId}`);
  }
}
