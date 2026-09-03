import { Card, Group, Progress, Text } from '@mantine/core';
import { HardDrive } from 'lucide-react';
import { storageRows } from '../../lib/mock-data';

export function StorageMap() {
  return (
    <Card>
      <Group justify="space-between" mb="lg">
        <div>
          <Text className="eyebrow">STORAGE MAP</Text>
          <h2>Where your library lives</h2>
        </div>
        <HardDrive size={18} />
      </Group>
      {storageRows.map(([path, value, size]) => (
        <div className="bar-row" key={path}>
          <Group justify="space-between">
            <Text size="sm">{path}</Text>
            <Text size="xs" c="dimmed">
              {size}
            </Text>
          </Group>
          <Progress value={value} color="cyan" mt={7} />
        </div>
      ))}
    </Card>
  );
}
