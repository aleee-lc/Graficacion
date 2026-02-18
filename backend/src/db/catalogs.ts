import type { PoolClient } from 'pg';
import { pool } from './pool';

type Queryable = Pick<PoolClient, 'query'>;

const catalogTables = {
  userTypes: 'user_types',
  techniqueStatuses: 'technique_statuses',
  requirementSources: 'requirement_sources_catalog',
  requirementStatuses: 'requirement_statuses',
  relationshipTypes: 'relationship_types'
} as const;

type CatalogTable = (typeof catalogTables)[keyof typeof catalogTables];

type CatalogRow = {
  id: number;
};

const cache = new Map<string, number>();

const getCatalogIdByCode = async (
  table: CatalogTable,
  code: string,
  db: Queryable = pool
): Promise<number | null> => {
  const normalizedCode = code.trim().toUpperCase();
  const key = `${table}:${normalizedCode}`;

  if (db === pool) {
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
  }

  const result = await db.query<CatalogRow>(
    `SELECT id FROM ${table} WHERE UPPER(code) = $1 LIMIT 1`,
    [normalizedCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const id = result.rows[0].id;

  if (db === pool) {
    cache.set(key, id);
  }

  return id;
};

export const getUserTypeIdByCode = (code: string, db?: Queryable) =>
  getCatalogIdByCode(catalogTables.userTypes, code, db);

export const getTechniqueStatusIdByCode = (code: string, db?: Queryable) =>
  getCatalogIdByCode(catalogTables.techniqueStatuses, code, db);
