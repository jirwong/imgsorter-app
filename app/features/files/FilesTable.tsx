import { useMemo, useState } from 'react';
import { Badge, Button, Group, Select, Table, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { formatBytes } from '../../lib/format';
import type { Entry } from '../../lib/types';

export type FilesTableProps = {
  files: Entry[];
  unique?: boolean;
  onSelect: (e: Entry) => void;
};

export function FilesTable({ files, unique, onSelect }: FilesTableProps) {
  const [fileQuery, setFileQuery] = useState('');
  const [directory, setDirectory] = useState('All directories');
  const [count, setCount] = useState('All counts');
  const [size, setSize] = useState('All sizes');
  const [extension, setExtension] = useState('All extensions');

  const directories = useMemo(() => [...new Set(files.map((e) => e.directory))], [files]);
  const extensions = useMemo(() => [...new Set(files.map((e) => e.extension))], [files]);

  const list = useMemo(
    () =>
      [...files]
        .filter(
          (e) =>
            (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
            (directory === 'All directories' || e.directory === directory) &&
            (extension === 'All extensions' || e.extension === extension) &&
            (count === 'All counts' || count === 'Unique only') &&
            (size === 'All sizes' ||
              (size === 'Under 10 MB' && e.size < 10000000) ||
              (size === '10–25 MB' && e.size >= 10000000 && e.size <= 25000000) ||
              (size === 'Over 25 MB' && e.size > 25000000)),
        )
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [files, fileQuery, directory, extension, count, size],
  );

  return (
    <>
      <Group className="duplicate-filters" justify="space-between" mb="md">
        <Group gap="8">
          <TextInput
            value={fileQuery}
            onChange={(event) => setFileQuery(event.currentTarget.value)}
            placeholder="Filter filename or path"
            leftSection={<Search size={15} />}
          />
          <Select
            value={directory}
            onChange={(v) => setDirectory(v ?? 'All directories')}
            data={['All directories', ...directories]}
          />
          <Select value={count} onChange={(v) => setCount(v ?? 'All counts')} data={['All counts', 'Unique only']} />
          <Select
            value={size}
            onChange={(v) => setSize(v ?? 'All sizes')}
            data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']}
          />
          <Select
            value={extension}
            onChange={(v) => setExtension(v ?? 'All extensions')}
            data={['All extensions', ...extensions]}
          />
        </Group>
        <Text size="sm" c="dimmed">
          {list.length} files found
        </Text>
      </Group>
      <Table className="files-table" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Filename</Table.Th>
            <Table.Th>Location</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Size</Table.Th>
            {unique && <Table.Th>Actions</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((e) => (
            <Table.Tr key={e.id} onClick={() => onSelect(e)} className="file-table-row">
              <Table.Td>
                <Text size="sm" fw={500} truncate>
                  {e.filename}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text className="table-meta" size="xs" truncate>
                  {e.directory}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">{e.extension}</Badge>
              </Table.Td>
              <Table.Td>
                <Text className="table-meta" size="xs">
                  {formatBytes(e.size)}
                </Text>
              </Table.Td>
              {unique && (
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    className="preview-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(e);
                    }}
                  >
                    Preview
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
