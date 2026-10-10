import { createServerFn } from '@tanstack/react-start';
import { normalizeDirectoryKey } from '../../app/lib/directory-path';
import type { DuplicatesData, KeeperMap } from '../../app/lib/types';

export const getDuplicatesData = createServerFn({ method: 'GET' }).handler(async (): Promise<DuplicatesData> => {
  const { getDuplicateGroups, getKeeperData } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  const roots = enabledRoots();
  const groups = getDuplicateGroups(roots);
  const { keepers, stale } = getKeeperData(appConfigStore.getKeepers(), roots);
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
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  const { stale } = getKeeperData(appConfigStore.getKeepers(), enabledRoots());
  const staleKeys = new Set(stale.map((path) => normalizeDirectoryKey(path)));
  const remaining = appConfigStore.getKeepers().filter((path) => !staleKeys.has(normalizeDirectoryKey(path)));
  appConfigStore.setKeepers(remaining);
  return { staleKeepers: 0 };
});
