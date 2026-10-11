import '@tanstack/react-start/server-only';
import { normalizeDirectoryKey } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';

export type HiddenService = {
  get: () => string[];
  hide: (path: string) => string[];
  hideMany: (paths: string[]) => string[];
  unhide: (path: string) => string[];
  unhideMany: (paths: string[]) => string[];
  clear: () => string[];
};

export type HiddenDeps = {
  getHidden: () => string[];
  setHidden: (paths: string[]) => string[];
};

export function createHiddenService(deps: HiddenDeps): HiddenService {
  return {
    get: () => deps.getHidden(),
    hide: (path) => deps.setHidden([...deps.getHidden(), path]),
    hideMany: (paths) => deps.setHidden([...deps.getHidden(), ...paths]),
    unhide: (path) => {
      const key = normalizeDirectoryKey(path);
      return deps.setHidden(deps.getHidden().filter((item) => normalizeDirectoryKey(item) !== key));
    },
    unhideMany: (paths) => {
      const keys = new Set(paths.map(normalizeDirectoryKey));
      return deps.setHidden(deps.getHidden().filter((item) => !keys.has(normalizeDirectoryKey(item))));
    },
    clear: () => deps.setHidden([]),
  };
}

export const hiddenService = createHiddenService({
  getHidden: () => appConfigStore.getHidden(),
  setHidden: (paths) => appConfigStore.setHidden(paths),
});
