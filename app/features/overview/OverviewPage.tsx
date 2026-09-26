import { Button, Card, Group, Text } from '@mantine/core';
import { ChevronRight } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { MetricCard } from './MetricCard';
import { StorageMap } from './StorageMap';
import { LastRunCard } from './LastRunCard';
import { formatBytes } from '../../lib/format';
import { thumbs } from '../../lib/mock-data';
import type { OverviewData } from '../../lib/types';

const STATIC_METRIC: [string, string, string] = ['Not backed up', '2,184', 'attention'];

export function OverviewPage({ data }: { data: OverviewData }) {
  const router = useRouter();

  const metrics: [string, string, string][] = [
    ['Total files', data.totalFiles.toLocaleString('en-US'), ''],
    ['Total size', formatBytes(data.totalSize), ''],
    ['Duplicate groups', String(data.duplicateGroups), ''],
    ['Redundant space', formatBytes(data.redundantSpace), ''],
    ['Unique files', data.uniqueFiles.toLocaleString('en-US'), ''],
    STATIC_METRIC,
  ];

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Overview"
        subtitle="A quiet view of what your library is keeping, duplicating, and missing."
        showExport
      />
      <div className="metric-grid">
        {metrics.map(([label, value, note]) => (
          <MetricCard key={label} label={label} value={value} note={note} />
        ))}
      </div>
      <div className="two-col">
        <StorageMap rows={data.storageMap} />
        <LastRunCard />
      </div>
      <Card className="compact-list">
        <Group justify="space-between">
          <div>
            <Text className="eyebrow">AT A GLANCE</Text>
            <h2>Largest files</h2>
          </div>
          <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' })}>
            View analytics <ChevronRight size={14} />
          </Button>
        </Group>
        {data.largestFiles.map((entry, i) => (
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
