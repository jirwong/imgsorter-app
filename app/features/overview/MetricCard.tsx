import { Card, Text } from '@mantine/core';

export type MetricCardProps = {
  label: string;
  value: string;
  note: string;
};

export function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <Card className="metric" key={label}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <strong>{value}</strong>
      <Text size="xs" c={note === 'attention' ? 'orange' : 'cyan'}>
        {note || 'Indexed locally'}
      </Text>
    </Card>
  );
}
