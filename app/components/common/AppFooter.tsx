import { Group } from '@mantine/core';
import { Database, HardDrive } from 'lucide-react';

export function AppFooter() {
  return (
    <footer>
      <Group gap="lg">
        <span>
          <Database size={13} /> 18,426 files
        </span>
        <span>
          <HardDrive size={13} /> 2.4 GB indexed
        </span>
      </Group>
      <span>Last scan 2 minutes ago · 4 warnings</span>
    </footer>
  );
}
