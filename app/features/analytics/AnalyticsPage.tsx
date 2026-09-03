import { useEffect, useState } from 'react';
import { Button, Card, Group, Select, Table, Text } from '@mantine/core';
import { PageHeading } from '../../components/common/PageHeading';
import { formatBytes } from '../../lib/format';
import { entries, groups } from '../../lib/mock-data';

export function AnalyticsPage() {
  const [pageSize, setPageSize] = useState('10');
  const [copiesPageSize, setCopiesPageSize] = useState('10');
  const [sizePage, setSizePage] = useState(1);
  const [copiesPage, setCopiesPage] = useState(1);

  const rankedBySize = [...entries].sort((a, b) => b.size - a.size);
  const rankedByCopies = [...groups].sort((a, b) => b.count - a.count);
  const sizeLimit = Number(pageSize);
  const copiesLimit = Number(copiesPageSize);
  const sizePages = Math.max(1, Math.ceil(rankedBySize.length / sizeLimit));
  const copiesPages = Math.max(1, Math.ceil(rankedByCopies.length / copiesLimit));

  useEffect(() => {
    setSizePage(1);
  }, [pageSize, rankedBySize.length]);
  useEffect(() => {
    setCopiesPage(1);
  }, [copiesPageSize, rankedByCopies.length]);

  const sizeRows = rankedBySize.slice((sizePage - 1) * sizeLimit, sizePage * sizeLimit);
  const copiesRows = rankedByCopies.slice((copiesPage - 1) * copiesLimit, copiesPage * copiesLimit);

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
              value={pageSize}
              onChange={(v) => setPageSize(v ?? '5')}
              data={['5', '10', '25']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {sizeRows.map((e, i) => (
                <Table.Tr key={e.id}>
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
              onChange={(v) => setCopiesPageSize(v ?? '5')}
              data={['5', '10', '25']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {copiesRows.map((g, i) => (
                <Table.Tr key={g.hash}>
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
