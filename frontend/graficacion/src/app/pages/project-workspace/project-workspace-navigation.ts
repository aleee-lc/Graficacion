import type { CaptureModuleKey, ModuleKey, NavigationGroup, WorkspaceModule } from './project-workspace.models';

// I keep the sidebar map outside the component so changing the workspace structure is not mixed with behavior.
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  { key: 'summary', label: 'Resumen', icon: 'dashboard', tone: 'blue' },
  { key: 'context', label: 'Contexto del Proyecto', icon: 'article', tone: 'blue' },
  { key: 'projectFiles', label: 'Carpeta del Proyecto', icon: 'folder_open', tone: 'amber' },
  { key: 'stakeholders', label: 'Stakeholders', icon: 'group', tone: 'cyan' },
  { key: 'processes', label: 'Procesos', icon: 'account_tree', tone: 'emerald' },
  { key: 'techniques', label: 'Tecnicas', icon: 'psychology_alt', tone: 'blue' },
  { key: 'evidences', label: 'Evidencias', icon: 'folder_open', tone: 'amber' },
  { key: 'findings', label: 'Hallazgos', icon: 'search', tone: 'slate' },
  { key: 'requirements', label: 'Requisitos', icon: 'fact_check', tone: 'violet' },
  { key: 'useCases', label: 'Historias / Casos', icon: 'menu_book', tone: 'indigo' },
  { key: 'specs', label: 'Specs', icon: 'description', tone: 'blue' },
  { key: 'modeling', label: 'Modelado', icon: 'schema', tone: 'cyan' },
  { key: 'validation', label: 'Validacion', icon: 'rule', tone: 'amber' },
  { key: 'traceability', label: 'Trazabilidad', icon: 'hub', tone: 'purple' }
];

export const TECHNIQUE_MODULES: Array<WorkspaceModule & { key: CaptureModuleKey; technique: string }> = [
  { key: 'interviews', label: 'Entrevistas', icon: 'chat_bubble', tone: 'blue', technique: 'Entrevista' },
  { key: 'surveys', label: 'Cuestionarios', icon: 'assignment', tone: 'green', technique: 'Cuestionario' },
  { key: 'observations', label: 'Observaciones', icon: 'visibility', tone: 'orange', technique: 'Observacion' },
  { key: 'focus', label: 'Focus Groups', icon: 'groups', tone: 'pink', technique: 'Focus Group' },
  { key: 'documents', label: 'Documentos', icon: 'folder_open', tone: 'amber', technique: 'Documento' },
  { key: 'tracking', label: 'Seguimiento', icon: 'trending_up', tone: 'red', technique: 'Seguimiento Transaccional' }
];

const group = (label: string, keys: ModuleKey[]): NavigationGroup => ({
  label,
  items: WORKSPACE_MODULES.filter((module) => keys.includes(module.key))
});

export const WORKSPACE_NAVIGATION_GROUPS: NavigationGroup[] = [
  group('Fundacion', ['summary', 'context', 'projectFiles', 'stakeholders', 'processes']),
  group('Discovery', ['techniques', 'evidences']),
  group('Analisis', ['findings', 'requirements']),
  group('Sintesis', ['useCases', 'specs', 'modeling']),
  group('Entrega', ['validation', 'traceability', 'projectFiles'])
];
