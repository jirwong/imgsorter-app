import type { DuplicateGroup, KeeperMap } from '../../lib/types';

export type KeeperFilterValue = 'All groups' | 'With keeper' | 'Without keeper';

export function matchesKeeperFilter(group: DuplicateGroup, keepers: KeeperMap, filter: KeeperFilterValue): boolean {
  if (filter === 'With keeper') return Boolean(keepers[group.key]);
  if (filter === 'Without keeper') return !keepers[group.key];
  return true;
}
