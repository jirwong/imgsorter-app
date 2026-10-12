import { useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useApp } from './app-context';

export type FilterSearch = {
  selectedDirs?: string[];
};

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
