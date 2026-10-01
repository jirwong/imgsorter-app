import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { Entry } from './types';

export type AppContextValue = {
  query: string;
  setQuery: (v: string) => void;
  dir: string;
  setDir: (v: string) => void;
  ext: string;
  setExt: (v: string) => void;
  selectedDirs: string[];
  setSelectedDirs: (dirs: string[]) => void;
  toggleSelectedDir: (path: string) => void;
  clearSelectedDirs: () => void;
  selectedFile: Entry | null;
  setSelectedFile: (e: Entry | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactElement {
  const [query, setQuery] = useState('');
  const [dir, setDir] = useState('All directories');
  const [ext, setExt] = useState('All types');
  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<Entry | null>(null);

  const toggleSelectedDir = useCallback((path: string) => {
    setSelectedDirs((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
  }, []);

  const clearSelectedDirs = useCallback(() => setSelectedDirs([]), []);

  const value = useMemo<AppContextValue>(
    () => ({
      query,
      setQuery,
      dir,
      setDir,
      ext,
      setExt,
      selectedDirs,
      setSelectedDirs,
      toggleSelectedDir,
      clearSelectedDirs,
      selectedFile,
      setSelectedFile,
    }),
    [query, dir, ext, selectedDirs, toggleSelectedDir, clearSelectedDirs, selectedFile],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within <AppProvider>');
  }
  return ctx;
}
