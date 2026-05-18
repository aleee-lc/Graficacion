import type {
  Finding,
  Requirement,
  SurveyQuestionType,
  TraceabilityItem
} from '../../services/traceability.service';

// I keep the workspace contracts here so the component can focus on behavior instead of type noise.
export type ModuleKey =
  | 'summary'
  | 'context'
  | 'projectFiles'
  | 'stakeholders'
  | 'processes'
  | 'techniques'
  | 'evidences'
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'documents'
  | 'tracking'
  | 'findings'
  | 'requirements'
  | 'useCases'
  | 'specs'
  | 'modeling'
  | 'agent'
  | 'traceability'
  | 'validation'
  | 'ai';

export type CaptureModuleKey =
  | 'interviews'
  | 'surveys'
  | 'observations'
  | 'focus'
  | 'documents'
  | 'tracking';

export type TraceViewKey = 'chain' | 'matrix' | 'risks';
export type DiagramKind = 'use_case' | 'class' | 'sequence' | 'package' | 'component' | 'free';
export type DiagramNodeType =
  | 'actor'
  | 'use_case'
  | 'class'
  | 'package'
  | 'component'
  | 'requirement'
  | 'spec'
  | 'note'
  | 'lifeline'
  | 'boundary';
export type DiagramEdgeType = 'association' | 'include' | 'extend' | 'dependency' | 'inheritance';
export type DiagramEditorMode = 'select' | 'connect';
export type DiagramResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 's';
export type AgentProfileKey = 'gemini' | 'codex' | 'generic';

export type WorkspaceModule = {
  key: ModuleKey;
  label: string;
  icon: string;
  tone: string;
  technique?: string;
};

export type NavigationGroup = {
  label: string;
  items: WorkspaceModule[];
};

export type DerivedUseCase = {
  id: string;
  persistedId: number | null;
  title: string;
  requirement: Requirement;
  actor: string;
  action: string;
  benefit: string;
  acceptanceCriteria: string;
  sourceFindings: Finding[];
};

export type DerivedSpec = {
  id: string;
  title: string;
  useCase: DerivedUseCase;
  markdown: string;
  endpoints: string[];
  tests: string[];
};

export type DerivedAgentTask = {
  id: string;
  title: string;
  spec: DerivedSpec;
  files: string[];
  prompt: string;
};

export type AgentProfile = {
  key: AgentProfileKey;
  label: string;
  provider: string;
  model: string;
  description: string;
};

export type DerivedDiagram = {
  id: string;
  title: string;
  kind: string;
  source: string;
  sourceRequirementIds: number[];
  sourceUseCaseIds: number[];
  sourceSpecIds: string[];
  mermaid: string;
};

export type DiagramNode = {
  id: string;
  type: DiagramNodeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  requirementId?: number;
  specId?: string;
};

export type DiagramEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: DiagramEdgeType;
  label?: string;
};

export type DiagramModel = {
  id: string;
  projectId: number | null;
  type: DiagramKind;
  title: string;
  sourceRequirementIds: number[];
  sourceUseCaseIds: number[];
  sourceSpecIds: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  derived: boolean;
};

export type SavedDiagramEntry = {
  id: string;
  title: string;
  type: DiagramKind;
  updatedAt: string;
  diagram: DiagramModel;
};

export type ProjectArtifactFile = {
  id: string;
  folder: string;
  name: string;
  kind: string;
  content: string;
  encoding: 'text' | 'data_url';
  mime_type?: string;
  size_bytes?: number;
  source: 'generated' | 'edited' | 'custom' | 'imported';
  updatedAt?: string;
};

export type ProjectFileDraft = {
  folder: string;
  name: string;
  kind: string;
  content: string;
};

export type SurveyQuestionDraft = {
  question_text: string;
  question_type: SurveyQuestionType;
  required: boolean;
  optionsText: string;
  help_text: string;
};

export type DomainEntity = {
  name: string;
  attributes: string[];
  operations: string[];
};

export type TraceAuditRow = {
  id: string;
  stakeholder: string;
  technique: string;
  evidence: string;
  finding: string;
  requirement: Requirement | TraceabilityItem;
  useCase: DerivedUseCase | null;
  spec: DerivedSpec | null;
  diagram: DerivedDiagram | null;
  task: DerivedAgentTask | null;
  status: 'complete' | 'missing-evidence' | 'missing-finding' | 'missing-requirement' | 'missing-spec' | 'missing-task';
  statusLabel: string;
  source: 'backend' | 'derived';
};
