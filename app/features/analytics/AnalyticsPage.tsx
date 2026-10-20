import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Group, Select, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PageHeading } from '../../components/common/PageHeading';
import { formatBytes } from '../../lib/format';
import { getAnalyticsPage } from '../../../server/routes/analytics';
import type { AnalyticsQuery, AnalyticsResult } from '../../lib/types';

export const DEFAULT_ANALYTICS_QUERY: AnalyticsQuery = {
  sizePage: 1,
  sizePageSize: 10,
  copiesPage: 1,
  copiesPageSize: 10,
};

function toPageSize(value: string): AnalyticsQuery['sizePageSize'] {
  switch (value) {
    case '5':
      return 5;
    case '25':
      return 25;
    case '50':
      return 50;
    default:
      return 10;
  }
}

export function AnalyticsPage({ initial }: { initial: AnalyticsResult }) {
  const [data, setData] = useState(initial);
  const [sizePageSize, setSizePageSize] = useState('10');
  const [copiesPageSize, setCopiesPageSize] = useState('10');
  const [sizePage, setSizePage] = useState(1);
  const [copiesPage, setCopiesPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const initialised = useRef(false);
  const loaderData = useRef(initial);
  const requestId = useRef(0);

  useEffect(() => {
    if (loaderData.current === initial) return;
    loaderData.current = initial;
    setRevision((value) => value + 1);
  }, [initial]);

  const query = useMemo<AnalyticsQuery>(
    () => ({
      sizePage,
      sizePageSize: toPageSize(sizePageSize),
      copiesPage,
      copiesPageSize: toPageSize(copiesPageSize),
    }),
    [sizePage, sizePageSize, copiesPage, copiesPageSize],
  );

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    let cancelled = false;
    const id = ++requestId.current;
    getAnalyticsPage({ data: query })
      .then((result) => {
        if (!cancelled && id === requestId.current) setData(result);
      })
      .catch(() => {
        if (!cancelled && id === requestId.current) {
          notifications.show({ color: 'red', message: 'Could not load analytics.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, revision]);

  const sizeLimit = toPageSize(sizePageSize);
  const copiesLimit = toPageSize(copiesPageSize);
  const sizePages = Math.max(1, Math.ceil(data.totalFiles / sizeLimit));
  const copiesPages = Math.max(1, Math.ceil(data.totalCopies / copiesLimit));

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Analytics"
        subtitle="Explore analytics across your indexed media library."
      />
      <div className="two-col">
        <Card>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="eyebrow">RANKED BY SIZE</Text>
              <h2>Biggest files</h2>
            </div>
            <Select
              aria-label="Items per page for ranked by size"
              value={sizePageSize}
              onChange={(v) => {
                setSizePageSize(v ?? '10');
                setSizePage(1);
              }}
              data={['5', '10', '25', '50']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {data.rankedBySize.map((e, i) => (
                <Table.Tr key={`${e.filename}-${i}`}>
                  <Table.Td>{(sizePage - 1) * sizeLimit + i + 1}</Table.Td>
                  <Table.Td>{e.filename}</Table.Td>
                  <Table.Td>{formatBytes(e.size)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group className="analytics-pagination" justify="space-between" mt="md">
            <Button
              variant="subtle"
              size="xs"
              disabled={sizePage === 1}
              onClick={() => setSizePage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Text size="xs" c="dimmed">
              Page {sizePage} of {sizePages}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              disabled={sizePage === sizePages}
              onClick={() => setSizePage((page) => Math.min(sizePages, page + 1))}
            >
              Next
            </Button>
          </Group>
        </Card>
        <Card>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="eyebrow">RANKED BY COPIES</Text>
              <h2>Most duplicated</h2>
            </div>
            <Select
              aria-label="Items per page for ranked by copies"
              value={copiesPageSize}
              onChange={(v) => {
                setCopiesPageSize(v ?? '10');
                setCopiesPage(1);
              }}
              data={['5', '10', '25', '50']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {data.rankedByCopies.map((g, i) => (
                <Table.Tr key={`${g.name}-${i}`}>
                  <Table.Td>{(copiesPage - 1) * copiesLimit + i + 1}</Table.Td>
                  <Table.Td>{g.name}</Table.Td>
                  <Table.Td>×{g.count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group className="analytics-pagination" justify="space-between" mt="md">
            <Button
              variant="subtle"
              size="xs"
              disabled={copiesPage === 1}
              onClick={() => setCopiesPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Text size="xs" c="dimmed">
              Page {copiesPage} of {copiesPages}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              disabled={copiesPage === copiesPages}
              onClick={() => setCopiesPage((page) => Math.min(copiesPages, page + 1))}
            >
              Next
            </Button>
          </Group>
        </Card>
      </div>
    </>
  );
}
