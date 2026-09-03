import { Button, Card, Group, Text } from '@mantine/core';
import { ChevronRight } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { MetricCard } from './MetricCard';
import { StorageMap } from './StorageMap';
import { LastRunCard } from './LastRunCard';
import { largestFiles, metricRows, thumbs } from '../../lib/mock-data';
import { formatBytes } from '../../lib/format';

export function OverviewPage() {
  const router = useRouter();

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Overview"
        subtitle="A quiet view of what your library is keeping, duplicating, and missing."
        showExport
      />
      <div className="metric-grid">
        {metricRows.map(([label, value, note]) => (
          <MetricCard key={label} label={label} value={value} note={note} />
        ))}
      </div>
      <div className="two-col">
        <StorageMap />
        <LastRunCard />
      </div>
      <Card className="compact-list">
        <Group justify="space-between">
          <div>
            <Text className="eyebrow">AT A GLANCE</Text>
            <h2>Largest files</h2>
          </div>
          <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' as string })}>
            View analytics <ChevronRight size={14} />
          </Button>
        </Group>
        {largestFiles.map((entry, i) => (
          <Group justify="space-between" className="file-row" key={entry.id}>
            <Group>
              <img src={thumbs[i % thumbs.length]} alt="" />
              <div>
                <Text size="sm">{entry.filename}</Text>
                <Text size="xs" c="dimmed">
                  {entry.directory}
                </Text>
              </div>
            </Group>
            <Text size="sm">{formatBytes(entry.size)}</Text>
          </Group>
        ))}
      </Card>
    </>
  );
}
