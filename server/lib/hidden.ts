import '@tanstack/react-start/server-only';
import { normalizeDirectoryKey } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';

export type HiddenService = {
  get: () => string[];
  hide: (path: string) => string[];
  unhide: (path: string) => string[];
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
    unhide: (path) => {
      const key = normalizeDirectoryKey(path);
      return deps.setHidden(deps.getHidden().filter((item) => normalizeDirectoryKey(item) !== key));
    },
    clear: () => deps.setHidden([]),
  };
}

export const hiddenService = createHiddenService({
  getHidden: () => appConfigStore.getHidden(),
  setHidden: (paths) => appConfigStore.setHidden(paths),
});
