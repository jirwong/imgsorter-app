import { Text } from '@mantine/core';
import { Menu } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = viewTitles[pathname] ?? 'imgsorter';

  return (
    <header>
      <div className="mobile-title">
        <Menu size={18} />
        <b>{title}</b>
      </div>
      <div className="header-status">
        <span className="dot" />
        <Text size="xs">Ready</Text>
      </div>
    </header>
  );
}
