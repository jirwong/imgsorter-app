import { useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useApp } from './app-context';

export type FilterSearch = {
  query?: string;
  dir?: string;
  ext?: string;
  selectedDirs?: string[];
};

export function useFilterSearchParams() {
  const { query, setQuery, dir, setDir, ext, setExt } = useApp();
  const search = useSearch({ strict: false }) as FilterSearch;
  const navigate = useNavigate();

  useEffect(() => {
    if (search.query !== undefined && search.query !== query) setQuery(search.query);
    if (search.dir !== undefined && search.dir !== dir) setDir(search.dir);
    if (search.ext !== undefined && search.ext !== ext) setExt(search.ext);
  }, [search.query, search.dir, search.ext, query, dir, ext, setQuery, setDir, setExt]);

  useEffect(() => {
    navigate({
      replace: true,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        query: query || undefined,
        dir: dir === 'All directories' ? undefined : dir,
        ext: ext === 'All types' ? undefined : ext,
      })) as never,
    });
  }, [query, dir, ext, navigate]);
}

export function useSelectedDirsSearchParams() {
  const { selectedDirs, setSelectedDirs } = useApp();
  const search = useSearch({ strict: false }) as FilterSearch;
  const navigate = useNavigate();

  useEffect(() => {
    if (search.selectedDirs !== undefined) {
      const incoming = [...search.selectedDirs].sort().join('|');
      const current = [...selectedDirs].sort().join('|');
      if (incoming !== current) setSelectedDirs(search.selectedDirs);
    }
  }, [search.selectedDirs, selectedDirs, setSelectedDirs]);

  useEffect(() => {
    navigate({
      replace: true,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        selectedDirs: selectedDirs.length > 0 ? selectedDirs : undefined,
      })) as never,
    });
  }, [selectedDirs, navigate]);
}
