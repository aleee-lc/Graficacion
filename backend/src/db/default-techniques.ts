import { pool } from './pool';

type DefaultTechnique = {
  name: string;
  description: string;
};

const DEFAULT_TECHNIQUES: DefaultTechnique[] = [
  {
    name: 'Entrevista',
    description: 'Conversaciones guiadas con usuarios y stakeholders para descubrir necesidades y objetivos.'
  },
  {
    name: 'Observacion',
    description: 'Observacion del flujo real de trabajo para detectar cuellos de botella y oportunidades.'
  },
  {
    name: 'Taller de descubrimiento',
    description: 'Sesion colaborativa para alinear negocio, producto y tecnologia sobre el alcance.'
  },
  {
    name: 'Encuesta',
    description: 'Recoleccion de datos cuantitativos para validar hipotesis de uso y priorizacion.'
  },
  {
    name: 'Analisis documental',
    description: 'Revision de procesos, reglas de negocio y documentacion existente del dominio.'
  },
  {
    name: 'User story mapping',
    description: 'Desglose del journey de usuario para estructurar el backlog y plan de entregas.'
  },
  {
    name: 'Prototipado rapido',
    description: 'Validacion temprana de ideas de interfaz y flujo antes del desarrollo completo.'
  },
  {
    name: 'Refinamiento tecnico',
    description: 'Sesion tecnica para detallar requerimientos, riesgos y criterios de aceptacion.'
  }
];

export const ensureDefaultTechniques = async (): Promise<number> => {
  let inserted = 0;

  for (const item of DEFAULT_TECHNIQUES) {
    const result = await pool.query(
      `INSERT INTO techniques (name, description)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM techniques WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
       )`,
      [item.name, item.description]
    );

    inserted += result.rowCount ?? 0;
  }

  return inserted;
};

