export type StakeholderSelection = 'single' | 'multiple' | 'optional';
export type TechniqueCategory = 'direct' | 'indirect' | 'self_managed' | 'synthesis' | 'tracking';
export type TechniqueRelation =
  | 'stakeholders'
  | 'moderator'
  | 'interviewer'
  | 'process'
  | 'subprocess'
  | 'techUsers';
export type TechniqueEvidenceType = 'note' | 'file' | 'audio' | 'transcript' | 'document' | 'metric';

export type TechniqueDefinition = {
  code: string;
  label: string;
  description: string;
  category: TechniqueCategory;
  stakeholderSelection: StakeholderSelection;
  requiredRelations: TechniqueRelation[];
  evidenceTypes: TechniqueEvidenceType[];
};

export const TECHNIQUE_DEFINITIONS: TechniqueDefinition[] = [
  {
    code: 'interview',
    label: 'Entrevista',
    description: 'Sesion guiada uno a uno para descubrir necesidades, restricciones y criterios.',
    category: 'direct',
    stakeholderSelection: 'single',
    requiredRelations: ['stakeholders', 'interviewer'],
    evidenceTypes: ['note', 'audio', 'transcript', 'file']
  },
  {
    code: 'observation',
    label: 'Observacion',
    description: 'Registro de campo sobre el trabajo real, pasos, fricciones y excepciones.',
    category: 'direct',
    stakeholderSelection: 'single',
    requiredRelations: ['stakeholders', 'process'],
    evidenceTypes: ['note', 'file', 'audio']
  },
  {
    code: 'shadowing',
    label: 'Shadowing',
    description: 'Acompanamiento a un usuario durante su trabajo para detectar comportamiento real.',
    category: 'direct',
    stakeholderSelection: 'single',
    requiredRelations: ['stakeholders', 'process'],
    evidenceTypes: ['note', 'file', 'audio']
  },
  {
    code: 'focus_group',
    label: 'Focus Group',
    description: 'Sesion grupal moderada para contrastar percepciones y priorizar oportunidades.',
    category: 'direct',
    stakeholderSelection: 'multiple',
    requiredRelations: ['stakeholders', 'moderator'],
    evidenceTypes: ['note', 'audio', 'transcript', 'file']
  },
  {
    code: 'workshop',
    label: 'Workshop',
    description: 'Taller colaborativo para alinear procesos, alcance, decisiones y riesgos.',
    category: 'direct',
    stakeholderSelection: 'multiple',
    requiredRelations: ['stakeholders', 'moderator', 'process'],
    evidenceTypes: ['note', 'file', 'transcript']
  },
  {
    code: 'survey',
    label: 'Encuesta',
    description: 'Instrumento autogestionado para recolectar respuestas de varios participantes.',
    category: 'self_managed',
    stakeholderSelection: 'multiple',
    requiredRelations: ['stakeholders'],
    evidenceTypes: ['note', 'file']
  },
  {
    code: 'document_analysis',
    label: 'Analisis documental',
    description: 'Revision de politicas, manuales, formatos, reportes y reglas existentes.',
    category: 'indirect',
    stakeholderSelection: 'optional',
    requiredRelations: ['process'],
    evidenceTypes: ['document', 'note', 'file']
  },
  {
    code: 'transaction_tracking',
    label: 'Seguimiento transaccional',
    description: 'Medicion de pasos, tiempos, desviaciones y problemas en una transaccion real.',
    category: 'tracking',
    stakeholderSelection: 'optional',
    requiredRelations: ['process'],
    evidenceTypes: ['metric', 'note', 'file']
  },
  {
    code: 'user_story_synthesis',
    label: 'Historias de usuario',
    description: 'Sintesis trazable de necesidades en historias, criterios y estimaciones.',
    category: 'synthesis',
    stakeholderSelection: 'optional',
    requiredRelations: [],
    evidenceTypes: ['note', 'file']
  }
];

const techniqueByCode = new Map(TECHNIQUE_DEFINITIONS.map((definition) => [definition.code, definition]));

const legacyTechniqueAliases: Record<string, string> = {
  entrevista: 'interview',
  interview: 'interview',
  observacion: 'observation',
  observación: 'observation',
  observation: 'observation',
  shadowing: 'shadowing',
  'focus group': 'focus_group',
  'focus groups': 'focus_group',
  focus_group: 'focus_group',
  workshop: 'workshop',
  taller: 'workshop',
  'taller de descubrimiento': 'workshop',
  encuesta: 'survey',
  cuestionario: 'survey',
  survey: 'survey',
  documento: 'document_analysis',
  documentos: 'document_analysis',
  'analisis documental': 'document_analysis',
  'análisis documental': 'document_analysis',
  document_analysis: 'document_analysis',
  'seguimiento transaccional': 'transaction_tracking',
  transaction_tracking: 'transaction_tracking',
  tracking: 'transaction_tracking',
  'historias de usuario': 'user_story_synthesis',
  user_story_synthesis: 'user_story_synthesis'
};

export const normalizeTechniqueCode = (value: string): string | null => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return legacyTechniqueAliases[normalized] ?? (techniqueByCode.has(normalized) ? normalized : null);
};

export const getTechniqueDefinition = (codeOrLabel: string): TechniqueDefinition | null => {
  const code = normalizeTechniqueCode(codeOrLabel);
  return code ? techniqueByCode.get(code) ?? null : null;
};

export const techniqueLabelForCode = (codeOrLabel: string) =>
  getTechniqueDefinition(codeOrLabel)?.label ?? codeOrLabel.trim();
