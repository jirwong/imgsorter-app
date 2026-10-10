import '@tanstack/react-start/server-only';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';

function hiddenKey(path: string): string {
  return normalizeDirectoryPath(path).toLowerCase();
}

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
      const key = hiddenKey(path);
      return deps.setHidden(deps.getHidden().filter((item) => hiddenKey(item) !== key));
    },
    clear: () => deps.setHidden([]),
  };
}

export const hiddenService = createHiddenService({
  getHidden: () => appConfigStore.getHidden(),
  setHidden: (paths) => appConfigStore.setHidden(paths),
});
