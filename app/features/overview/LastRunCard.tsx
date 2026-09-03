import { Card, Group, Text } from '@mantine/core';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { runSteps } from '../../lib/mock-data';

export function LastRunCard() {
  return (
    <Card>
      <Text className="eyebrow">LAST RUN</Text>
      <h2>Scan completed cleanly</h2>
      <div className="run-list">
        {runSteps.map(([name, time]) => (
          <Group justify="space-between" key={name}>
            <span>
              <ShieldCheck size={14} />
              {name}
            </span>
            <Text size="xs" c="dimmed">
              {time}
            </Text>
          </Group>
        ))}
      </div>
      <Text size="xs" c="orange" mt="lg">
        <CircleAlert size={13} /> 4 files could not be read
      </Text>
    </Card>
  );
}
