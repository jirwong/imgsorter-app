import { Card, Group, Text } from '@mantine/core';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { formatRelativeTime } from '../../lib/format';
import type { LastScan } from '../../lib/types';

const ROWS: [keyof Pick<LastScan, 'directories' | 'filesScanned' | 'entriesWritten' | 'duplicateGroups'>, string][] = [
  ['directories', 'Directories'],
  ['filesScanned', 'Files scanned'],
  ['entriesWritten', 'Entries written'],
  ['duplicateGroups', 'Duplicate groups'],
];

export function LastRunCard({ lastScan }: { lastScan: LastScan | null }) {
  return (
    <Card>
      <Text className="eyebrow">LAST RUN</Text>
      {lastScan ? (
        <>
          <h2>Last scan {formatRelativeTime(lastScan.finishedAt)}</h2>
          <div className="run-list">
            {ROWS.map(([key, label]) => (
              <Group justify="space-between" key={key}>
                <span>
                  <ShieldCheck size={14} />
                  {label}
                </span>
                <Text size="xs" c="dimmed">
                  {lastScan[key].toLocaleString('en-US')}
                </Text>
              </Group>
            ))}
          </div>
          {lastScan.errors > 0 && (
            <Text size="xs" c="orange" mt="lg">
              <CircleAlert size={13} /> {lastScan.errors} errors during the scan
            </Text>
          )}
        </>
      ) : (
        <>
          <h2>No scan yet</h2>
          <Text size="xs" c="dimmed" mt="sm">
            Run a scan to see the last run summary.
          </Text>
        </>
      )}
    </Card>
  );
}
