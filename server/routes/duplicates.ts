import { createServerFn } from '@tanstack/react-start';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type { DuplicatesData, KeeperMap } from '../../app/lib/types';

function keeperKey(path: string): string {
  return normalizeDirectoryPath(path).toLowerCase();
}

export const getDuplicatesData = createServerFn({ method: 'GET' }).handler(async (): Promise<DuplicatesData> => {
  const { getDuplicateGroups, getKeeperData } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  const groups = getDuplicateGroups();
  const { keepers, stale } = getKeeperData(appConfigStore.getKeepers());
  return { groups, keepers, staleKeepers: stale.length };
});

export const saveKeepers = createServerFn({ method: 'POST' })
  .validator((input: { keepers: KeeperMap }) => input)
  .handler(async ({ data }) => {
    const { getEntryPathsByIds } = await import('../lib/queries');
    const { appConfigStore } = await import('../lib/app-config');
    const paths = getEntryPathsByIds(Object.values(data.keepers));
    appConfigStore.setKeepers(paths);
    return { saved: paths.length };
  });

export const clearStaleKeepers = createServerFn({ method: 'POST' }).handler(async () => {
  const { getKeeperData } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  const { stale } = getKeeperData(appConfigStore.getKeepers());
  const staleKeys = new Set(stale.map((path) => keeperKey(path)));
  const remaining = appConfigStore.getKeepers().filter((path) => !staleKeys.has(keeperKey(path)));
  appConfigStore.setKeepers(remaining);
  return { staleKeepers: 0 };
});
