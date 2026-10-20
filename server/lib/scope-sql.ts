import '@tanstack/react-start/server-only';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';

export type ScopeClause = { sql: string; params: string[] };

const GROUP_SQL = '(directory_norm = lower(?) OR (directory_norm >= lower(?) AND directory_norm < lower(?)))';

export function subtreeClause(root: string): ScopeClause {
  const key = normalizeDirectoryPath(root);
  return { sql: GROUP_SQL, params: [key, `${key}/`, `${key}0`] };
}

export function scopeClause(roots: string[]): ScopeClause {
  if (roots.length === 0) return { sql: '0', params: [] };
  const groups = roots.map(subtreeClause);
  if (groups.length === 1) return groups[0];
  return {
    sql: `(${groups.map((group) => group.sql).join(' OR ')})`,
    params: groups.flatMap((group) => group.params),
  };
}
