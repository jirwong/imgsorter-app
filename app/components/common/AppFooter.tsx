import { Group } from '@mantine/core';
import { Database, HardDrive } from 'lucide-react';
import { useLoaderData } from '@tanstack/react-router';
import { formatBytes, formatRelativeTime } from '../../lib/format';

export function AppFooter() {
  const { files, size, lastScan } = useLoaderData({ from: '__root__' });
  const scanText = lastScan
    ? `Last scan ${formatRelativeTime(lastScan.finishedAt)}${lastScan.errors > 0 ? ` · ${lastScan.errors} errors` : ''}`
    : 'No scan yet';

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
      <span>{scanText}</span>
    </footer>
  );
}
