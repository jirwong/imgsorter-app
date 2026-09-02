import { Select, Text, TextInput } from '@mantine/core';
import { Menu, Search } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { useApp } from '../../lib/app-context';
import { headerDirOptions, headerExtOptions } from '../../lib/mock-data';

const viewTitles: Record<string, string> = {
  '/': 'Overview',
  '/duplicates': 'Duplicates',
  '/unique-files': 'Unique Files',
  '/analytics': 'Analytics',
  '/browse': 'Browse',
  '/activity': 'Activity',
  '/preferences': 'Preferences',
};

export function AppHeader() {
  const { query, setQuery, dir, setDir, ext, setExt } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = viewTitles[pathname] ?? 'imgsorter';

  return (
    <header>
      <div className="mobile-title">
        <Menu size={18} />
        <b>{title}</b>
      </div>
      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        leftSection={<Search size={16} />}
        placeholder="Search files, paths, hashes..."
        className="search"
      />
      <Select
        value={dir}
        onChange={(value) => setDir(value ?? 'All directories')}
        data={['All directories', ...headerDirOptions]}
      />
      <Select
        value={ext}
        onChange={(value) => setExt(value ?? 'All types')}
        data={['All types', ...headerExtOptions]}
      />
      <div className="header-status">
        <span className="dot" />
        <Text size="xs">Ready</Text>
      </div>
    </header>
  );
}
