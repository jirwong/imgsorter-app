import { Group } from '@mantine/core';
import { Database, HardDrive } from 'lucide-react';
import { useLoaderData } from '@tanstack/react-router';
import { formatBytes } from '../../lib/format';

export function AppFooter() {
  const { files, size } = useLoaderData({ from: '__root__' });

  return (
    <footer>
      <Group gap="lg">
        <span>
          <Database size={13} /> {files.toLocaleString('en-US')} files
        </span>
        <span>
          <HardDrive size={13} /> {formatBytes(size)} indexed
        </span>
      </Group>
      <span>Last scan 2 minutes ago · 4 warnings</span>
    </footer>
  );
}
