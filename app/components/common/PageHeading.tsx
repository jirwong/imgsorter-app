import { Button, Group, Text } from '@mantine/core';
import { Download } from 'lucide-react';

export type PageHeadingProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  showExport?: boolean;
};

export function PageHeading({ eyebrow, title, subtitle, showExport }: PageHeadingProps) {
  return (
    <Group justify="space-between" mb="xl">
      <div>
        <Text className="eyebrow">{eyebrow}</Text>
        <h1>{title}</h1>
        <Text c="dimmed" size="sm">
          {subtitle}
        </Text>
      </div>
      {showExport && (
        <Group>
          <Button variant="light" leftSection={<Download size={15} />} color="gray">
            Export
          </Button>
        </Group>
      )}
    </Group>
  );
}
