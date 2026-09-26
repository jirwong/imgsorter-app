import { Card, Group, Progress, Text } from '@mantine/core';
import { HardDrive } from 'lucide-react';
import { formatBytes } from '../../lib/format';

export type StorageMapRow = { path: string; share: number; size: number };

export function StorageMap({ rows }: { rows: StorageMapRow[] }) {
  return (
    <Card>
      <Group justify="space-between" mb="lg">
        <div>
          <Text className="eyebrow">STORAGE MAP</Text>
          <h2>Where your library lives</h2>
        </div>
        <HardDrive size={18} />
      </Group>
      {rows.map((row) => (
        <div className="bar-row" key={row.path}>
          <Group justify="space-between">
            <Text size="sm">{row.path}</Text>
            <Text size="xs" c="dimmed">
              {formatBytes(row.size)}
            </Text>
          </Group>
          <Progress value={row.share} color="cyan" mt={7} />
        </div>
      ))}
    </Card>
  );
}
