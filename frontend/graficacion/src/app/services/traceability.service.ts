import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api';

export type Stakeholder = {
  id: number;
  project_id: number;
  name: string;
  role: string;
  type: 'internal' | 'external';
  contact: string | null;
  created_at: string;
};

export type Session = {
  id: number;
  project_id: number;
  title: string;
  technique: string;
  notes: string | null;
  occurred_at: string;
  created_at: string;
  stakeholder_count: number;
  evidence_count: number;
  finding_count: number;
};

export type Evidence = {
  id: number;
  session_id: number;
  kind: 'file' | 'note' | 'audio' | 'transcript';
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  bucket?: string | null;
  object_path?: string | null;
  created_at: string;
};

export type Finding = {
  id: number;
  session_id: number;
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  dedupe_key: string | null;
  created_at: string;
  session_title?: string;
  session_technique?: string;
  occurred_at?: string;
};

export type Requirement = {
  id: number;
  project_id: number;
  code: string;
  type: 'functional' | 'non_functional';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  acceptance_criteria: string;
  created_at: string;
  finding_ids: number[] | null;
  finding_count: number;
};

export type AIDraftFinding = {
  id: number;
  project_id: number;
  source_session_id: number;
  source_evidence_ids: number[];
  category: 'problem' | 'need' | 'constraint';
  statement: string;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  ai_model: string;
  prompt_version: string;
  created_by_user_id: number;
  reviewed_by_user_id: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type AIDraftRequirement = {
  id: number;
  project_id: number;
  source_finding_ids: number[];
  type: 'functional' | 'non_functional';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  acceptance_criteria: string;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  ai_model: string;
  prompt_version: string;
  created_by_user_id: number;
  reviewed_by_user_id: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type TraceabilityItem = {
  id: number;
  code: string;
  type: string;
  priority: string;
  description: string;
  acceptance_criteria: string;
  links: Array<{
    finding: { id: number; category: string; statement: string };
    session: { id: number; title: string; technique: string; occurred_at: string };
    stakeholders: Array<{
      id: number;
      name: string;
      role: string;
      type: 'internal' | 'external';
      contact: string | null;
    }>;
    evidences: Array<{
      id: number;
      kind: 'file' | 'note' | 'audio' | 'transcript';
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      notes: string | null;
      created_at: string;
    }>;
  }>;
};

export type FlowStatus = {
  progress_percent: number;
  completed_steps: number;
  steps: {
    step1: { complete: boolean; locked: boolean };
    step2: { complete: boolean; locked: boolean };
    step3: { complete: boolean; locked: boolean };
    step4: { complete: boolean; locked: boolean };
    step5: { complete: boolean; locked: boolean };
  };
  counts: {
    stakeholders_count: number;
    sessions_count: number;
    sessions_without_evidence_count: number;
    findings_count: number;
    requirements_count: number;
    trace_links_count: number;
  };
  next_action: {
    step: number;
    route: string;
    message: string;
  };
};

@Injectable({ providedIn: 'root' })
export class TraceabilityService {
  constructor(private readonly http: HttpClient) {}

  getStakeholders(projectId: number) {
    return this.http.get<{ stakeholders: Stakeholder[] }>(`${API_BASE_URL}/projects/${projectId}/stakeholders`);
  }

  createStakeholder(
    projectId: number,
    payload: { name: string; role: string; type: 'internal' | 'external'; contact?: string | null }
  ) {
    return this.http.post<{ stakeholder: Stakeholder }>(
      `${API_BASE_URL}/projects/${projectId}/stakeholders`,
      payload
    );
  }

  getSessions(projectId: number) {
    return this.http.get<{ sessions: Session[] }>(`${API_BASE_URL}/projects/${projectId}/sessions`);
  }

  getFlowStatus(projectId: number) {
    return this.http.get<{ flow_status: FlowStatus }>(`${API_BASE_URL}/projects/${projectId}/flow-status`);
  }

  createSession(
    projectId: number,
    payload: {
      title: string;
      technique: string;
      notes?: string | null;
      occurred_at?: string | null;
      stakeholder_ids: number[];
    }
  ) {
    return this.http.post<{ id: number }>(`${API_BASE_URL}/projects/${projectId}/sessions`, payload);
  }

  getSessionEvidences(sessionId: number) {
    return this.http.get<{ evidences: Evidence[] }>(`${API_BASE_URL}/sessions/${sessionId}/evidences`);
  }

  createSessionEvidence(
    sessionId: number,
    payload: {
      kind: 'note' | 'transcript';
      notes?: string | null;
    }
  ) {
    return this.http.post<{ evidence: Evidence }>(`${API_BASE_URL}/sessions/${sessionId}/evidences`, payload);
  }

  uploadSessionEvidenceFiles(sessionId: number, files: File[], notes?: string | null) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    if (notes && notes.trim().length > 0) {
      formData.append('notes', notes.trim());
    }

    return this.http.post<{ evidences: Evidence[]; uploaded_count: number }>(
      `${API_BASE_URL}/sessions/${sessionId}/evidences/upload`,
      formData
    );
  }

  createSessionEvidenceSignedUrl(sessionId: number, evidenceId: number, expiresIn?: number) {
    return this.http.post<{ url: string; expires_in: number }>(
      `${API_BASE_URL}/sessions/${sessionId}/evidences/${evidenceId}/signed-url`,
      expiresIn ? { expires_in: expiresIn } : {}
    );
  }

  getProjectFindings(projectId: number) {
    return this.http.get<{ findings: Finding[] }>(`${API_BASE_URL}/projects/${projectId}/findings`);
  }

  getSessionFindings(sessionId: number) {
    return this.http.get<{ findings: Finding[] }>(`${API_BASE_URL}/sessions/${sessionId}/findings`);
  }

  createSessionFinding(
    sessionId: number,
    payload: {
      category: 'problem' | 'need' | 'constraint';
      statement: string;
      dedupe_key?: string | null;
      allow_duplicate?: boolean;
    }
  ) {
    return this.http.post<{
      finding: Finding;
      duplicate_warning?: {
        message: string;
        duplicate: { id: number; statement: string; session_id: number; session_title: string };
      } | null;
    }>(`${API_BASE_URL}/sessions/${sessionId}/findings`, payload);
  }

  getRequirements(projectId: number) {
    return this.http.get<{ requirements: Requirement[] }>(`${API_BASE_URL}/projects/${projectId}/requirements`);
  }

  createRequirement(
    projectId: number,
    payload: {
      type: 'functional' | 'non_functional';
      priority: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      acceptance_criteria: string;
      finding_ids: number[];
    }
  ) {
    return this.http.post<{ id: number; code: string }>(`${API_BASE_URL}/projects/${projectId}/requirements`, payload);
  }

  getTraceability(projectId: number) {
    return this.http.get<{ traceability: TraceabilityItem[] }>(`${API_BASE_URL}/projects/${projectId}/traceability`);
  }

  generateAIDraftFindings(
    projectId: number,
    payload: { session_ids?: number[]; max_drafts?: number; prompt_version?: string }
  ) {
    return this.http.post<{
      drafts: AIDraftFinding[];
      generated_count: number;
      model: string;
      prompt_version: string;
    }>(`${API_BASE_URL}/projects/${projectId}/ai/draft-findings`, payload);
  }

  getAIDraftFindings(projectId: number, status?: 'pending' | 'accepted' | 'rejected') {
    const suffix = status ? `?status=${status}` : '';
    return this.http.get<{ drafts: AIDraftFinding[] }>(
      `${API_BASE_URL}/projects/${projectId}/ai/draft-findings${suffix}`
    );
  }

  updateAIDraftFinding(
    projectId: number,
    draftId: number,
    payload: {
      status?: 'pending' | 'accepted' | 'rejected';
      category?: 'problem' | 'need' | 'constraint';
      statement?: string;
      review_notes?: string | null;
    }
  ) {
    return this.http.patch<{ draft: AIDraftFinding }>(
      `${API_BASE_URL}/projects/${projectId}/ai/draft-findings/${draftId}`,
      payload
    );
  }

  generateAIDraftRequirements(
    projectId: number,
    payload: { finding_ids: number[]; max_drafts?: number; prompt_version?: string }
  ) {
    return this.http.post<{
      drafts: AIDraftRequirement[];
      generated_count: number;
      model: string;
      prompt_version: string;
    }>(`${API_BASE_URL}/projects/${projectId}/ai/draft-requirements`, payload);
  }

  getAIDraftRequirements(projectId: number, status?: 'pending' | 'accepted' | 'rejected') {
    const suffix = status ? `?status=${status}` : '';
    return this.http.get<{ drafts: AIDraftRequirement[] }>(
      `${API_BASE_URL}/projects/${projectId}/ai/draft-requirements${suffix}`
    );
  }

  updateAIDraftRequirement(
    projectId: number,
    draftId: number,
    payload: {
      status?: 'pending' | 'accepted' | 'rejected';
      type?: 'functional' | 'non_functional';
      priority?: 'low' | 'medium' | 'high' | 'critical';
      description?: string;
      acceptance_criteria?: string;
      source_finding_ids?: number[];
      review_notes?: string | null;
    }
  ) {
    return this.http.patch<{ draft: AIDraftRequirement }>(
      `${API_BASE_URL}/projects/${projectId}/ai/draft-requirements/${draftId}`,
      payload
    );
  }
}
