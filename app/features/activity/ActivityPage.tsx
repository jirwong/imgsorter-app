import { Badge, Button, Card, Group, Progress, Text } from '@mantine/core';
import { PageHeading } from '../../components/common/PageHeading';
import { cancelScan, useScanStatus } from '../../lib/scan-store';

const STATUS_LABEL: Record<string, string> = {
  idle: 'No active scan',
  running: 'Running',
  completed: 'Complete',
  cancelled: 'Cancelled',
  error: 'Failed',
};

export function ActivityPage() {
  const scan = useScanStatus();

  const running = scan.status === 'running';
  const percent =
    scan.summary !== null
      ? 100
      : running && scan.totalFiles
        ? Math.round((scan.filesProcessed / scan.totalFiles) * 100)
        : 0;
  const badgeColor =
    scan.status === 'running' ? 'cyan' : scan.status === 'cancelled' || scan.status === 'error' ? 'orange' : 'gray';

  const title = running ? `Indexing · ${scan.phase ?? 'scan'}` : (STATUS_LABEL[scan.status] ?? 'Scan');
  const detail = running
    ? `${scan.filesProcessed.toLocaleString('en-US')}${scan.totalFiles ? ` of ${scan.totalFiles.toLocaleString('en-US')}` : ''} files · ${scan.currentFile ?? scan.currentDirectory ?? 'starting…'}`
    : scan.summary
      ? `${scan.summary.filesScanned.toLocaleString('en-US')} files scanned · ${scan.summary.entriesWritten.toLocaleString('en-US')} written · ${scan.summary.duplicateGroups} duplicate groups · ${scan.summary.errors} errors`
      : scan.error
        ? scan.error
        : 'Last run completed today';

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Activity"
        subtitle="Explore activity across your indexed media library."
      />
      <div className="activity-page">
        <div className="activity-heading">
          <div>
            <Text className="eyebrow">ACTIVITY</Text>
            <h2>Scan activity</h2>
            <Text c="dimmed" size="sm">
              Monitor current and previous indexing runs.
            </Text>
          </div>
          <Group gap="sm">
            {running && (
              <Button size="xs" variant="light" color="orange" onClick={() => void cancelScan()}>
                Cancel scan
              </Button>
            )}
            <Badge color={badgeColor}>{STATUS_LABEL[scan.status] ?? 'Scan'}</Badge>
          </Group>
        </div>
        <Card className="scan-progress-card">
          <Group justify="space-between">
            <div>
              <Text className="eyebrow">CURRENT SCAN</Text>
              <h3>{title}</h3>
            </div>
            <Text size="sm" c={running ? 'cyan' : 'dimmed'}>
              {percent}%
            </Text>
          </Group>
          <Progress value={percent} color="cyan" mt="md" />
          <Text size="xs" c="dimmed" mt="sm">
            {detail}
          </Text>
        </Card>
        <Card>
          <Text className="eyebrow">EVENT LOG</Text>
          <h3>Recent events</h3>
          <div className="activity-log">
            {scan.log.map((log, index) => (
              <div className="activity-log-row" key={`${log.time}-${index}`}>
                <Text size="xs" c="dimmed">
                  {log.time}
                </Text>
                <div>
                  <Text size="sm">{log.event}</Text>
                  <Text size="xs" c="dimmed">
                    {log.directory}
                  </Text>
                </div>
                <Badge
                  variant="light"
                  color={log.status === 'Warning' ? 'orange' : log.status === 'Running' ? 'cyan' : 'gray'}
                >
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
