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
  | 'techTeam'
  | 'targetStack'
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
  | 'technicalContracts'
  | 'specs'
  | 'dataModel'
  | 'roles'
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
  | 'process'
  | 'decision'
  | 'database'
  | 'service'
  | 'screen'
  | 'api'
  | 'queue'
  | 'requirement'
  | 'spec'
  | 'note'
  | 'lifeline'
  | 'boundary';
export type DiagramEdgeType = 'association' | 'include' | 'extend' | 'dependency' | 'inheritance' | 'composition' | 'aggregation' | 'message' | 'data_flow';
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
  kind: DiagramKind;
  source: string;
  sourceRequirementIds: number[];
  sourceUseCaseIds: number[];
  sourceSpecIds: string[];
  diagram: DiagramModel;
};

export type DiagramNode = {
  id: string;
  type: DiagramNodeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  textColor?: string;
  layer?: string;
  notes?: string;
  requirementId?: number;
  specId?: string;
};

export type DiagramEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: DiagramEdgeType;
  label?: string;
  notes?: string;
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

export type FieldSpecType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'object' | 'array';
export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type TargetStack = {
  architectureType: string;
  backendFramework: string;
  backendLanguage: string;
  backendOrm: string;
  backendDatabase: string;
  backendMigrations: string;
  backendAuth: string;
  backendTesting: string;
  frontendFramework: string;
  frontendLanguage: string;
  frontendUi: string;
  frontendRouting: string;
  frontendDataFetching: string;
  frontendState: string;
  frontendTesting: string;
  runMode: string;
  envVars: string[];
  seedAdmin: string;
  commands: string[];
};

export type FieldSpec = {
  name: string;
  type: FieldSpecType;
  required: boolean;
  description?: string;
  example?: string;
  enumValues?: string[];
};

export type ExpectedError = {
  statusCode: 400 | 401 | 403 | 404 | 409 | 422 | 500;
  condition: string;
  message: string;
};

export type ImplementationContract = {
  requirementId: number;
  useCaseId?: number | null;
  screenName?: string;
  routePath?: string;
  endpointMethod?: EndpointMethod;
  endpointPath?: string;
  requestFields: FieldSpec[];
  responseFields: FieldSpec[];
  businessRules: string[];
  validations: string[];
  expectedErrors: ExpectedError[];
  permissions: string[];
  acceptanceChecks: string[];
  testCases: string[];
};

export type DataFieldSpec = {
  name: string;
  type: FieldSpecType;
  required: boolean;
  unique: boolean;
  nullable: boolean;
  defaultValue?: string;
  example?: string;
  description?: string;
};

export type DataRelationshipSpec = {
  fromEntity: string;
  toEntity: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  foreignKey?: string;
  onDelete?: string;
  description?: string;
};

export type DataEntitySpec = {
  id: string;
  name: string;
  tableName: string;
  description: string;
  source: 'manual' | 'inferred' | 'validated';
  confidence: 'alta' | 'media' | 'baja';
  fields: DataFieldSpec[];
  relationships: DataRelationshipSpec[];
  integrityRules: string[];
};

export type TargetRoleSpec = {
  id: string;
  name: string;
  description: string;
  userType: string;
  permissions: string[];
  screens: string[];
  endpoints: string[];
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
