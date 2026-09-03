import { Badge, Card, Group, Progress, Text } from '@mantine/core';
import { PageHeading } from '../../components/common/PageHeading';
import { useApp } from '../../lib/app-context';

export function ActivityPage() {
  const { scanActive, logs } = useApp();

  const badgeColor = scanActive ? 'cyan' : 'gray';
  const progressValue = scanActive ? 48 : 100;
  const scanTitle = scanActive ? 'Indexing configured directories' : 'No active scan';
  const scanSubtitle = scanActive ? '2 of 4 directories' : 'Last run completed today';
  const scanDetail = scanActive
    ? 'Scanning C:/Media/2025 · 1,248 files indexed'
    : '18,426 files indexed · 4 files could not be read';

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
          <Badge color={badgeColor}>{scanActive ? 'Running' : 'Complete'}</Badge>
        </div>
        <Card className="scan-progress-card">
          <Group justify="space-between">
            <div>
              <Text className="eyebrow">CURRENT SCAN</Text>
              <h3>{scanTitle}</h3>
            </div>
            <Text size="sm" c={scanActive ? 'cyan' : 'dimmed'}>
              {scanSubtitle}
            </Text>
          </Group>
          <Progress value={progressValue} color="cyan" mt="md" />
          <Text size="xs" c="dimmed" mt="sm">
            {scanDetail}
          </Text>
        </Card>
        <Card>
          <Text className="eyebrow">EVENT LOG</Text>
          <h3>Recent events</h3>
          <div className="activity-log">
            {logs.map((log, index) => (
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
