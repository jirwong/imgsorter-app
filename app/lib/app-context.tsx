import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { Entry, LogEntry } from './types';
import { entries } from './mock-data';
import { applyFilters } from './filter-pipeline';

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
  filtered: Entry[];
  selectedFile: Entry | null;
  setSelectedFile: (e: Entry | null) => void;
  scanActive: boolean;
  logs: LogEntry[];
  startScan: () => void;
  keepers: number[];
  toggleKeeper: (id: number) => void;
  setKeepers: (ids: number[]) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactElement {
  const [query, setQuery] = useState('');
  const [dir, setDir] = useState('All directories');
  const [ext, setExt] = useState('All types');
  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<Entry | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '09:42:18', event: 'Scan completed', directory: 'C:/Media/2025', status: 'Complete' },
    { time: '09:42:04', event: 'Permission denied', directory: 'C:/Media/2025/Private', status: 'Warning' },
    { time: '09:40:12', event: 'Files indexed', directory: 'D:/Camera Imports', status: 'Complete' },
  ]);
  const [keepers, setKeepers] = useState<number[]>([]);

  const filtered = useMemo(() => applyFilters(entries, query, dir, ext, selectedDirs), [query, dir, ext, selectedDirs]);

  const toggleSelectedDir = useCallback((path: string) => {
    setSelectedDirs((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
  }, []);

  const clearSelectedDirs = useCallback(() => setSelectedDirs([]), []);

  const startScan = useCallback(() => {
    setScanActive(true);
    setLogs((current) => [
      { time: 'Now', event: 'Scan started', directory: 'Enabled directories', status: 'Running' },
      ...current,
    ]);
  }, []);

  const toggleKeeper = useCallback((id: number) => {
    setKeepers((current) => (current.includes(id) ? current.filter((k) => k !== id) : [...current, id]));
  }, []);

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
      filtered,
      selectedFile,
      setSelectedFile,
      scanActive,
      logs,
      startScan,
      keepers,
      toggleKeeper,
      setKeepers,
    }),
    [
      query,
      dir,
      ext,
      selectedDirs,
      setSelectedDirs,
      toggleSelectedDir,
      clearSelectedDirs,
      filtered,
      selectedFile,
      scanActive,
      logs,
      startScan,
      keepers,
      toggleKeeper,
    ],
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
