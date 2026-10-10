import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Group, Select, Table, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { DirectoryPicker } from '../../components/common/DirectoryPicker';
import { normalizeDirectoryKey } from '../../lib/directory-path';
import { formatBytes } from '../../lib/format';
import type { Entry } from '../../lib/types';

export type FilesTableProps = {
  files: Entry[];
  unique?: boolean;
  hidden?: string[];
  onHide?: (path: string) => void;
  onUnhide?: (path: string) => void;
  onClearHidden?: () => void;
  onSelect: (e: Entry) => void;
};

export function FilesTable({ files, unique, hidden, onHide, onUnhide, onClearHidden, onSelect }: FilesTableProps) {
  const [fileQuery, setFileQuery] = useState('');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [count, setCount] = useState('All counts');
  const [size, setSize] = useState('All sizes');
  const [extension, setExtension] = useState('All extensions');
  const [hiddenFilter, setHiddenFilter] = useState('Active files');
  const [pageSize, setPageSize] = useState('25');
  const [page, setPage] = useState(1);

  const hiddenEnabled = hidden !== undefined && onHide !== undefined && onUnhide !== undefined;
  const hiddenKeys = useMemo(() => new Set((hidden ?? []).map(normalizeDirectoryKey)), [hidden]);
  const isHidden = useCallback((e: Entry) => hiddenKeys.has(normalizeDirectoryKey(e.path)), [hiddenKeys]);

  const directories = useMemo(() => [...new Set(files.map((e) => e.directory))], [files]);
  const directoryOptions = useMemo(
    () =>
      directories.map((d) => ({
        value: d,
        label: d,
        count: files.filter((e) => e.directory === d).length,
      })),
    [directories, files],
  );
  const extensions = useMemo(() => [...new Set(files.map((e) => e.extension))], [files]);
  const hiddenCount = useMemo(() => files.filter((e) => isHidden(e)).length, [files, isHidden]);

  const list = useMemo(
    () =>
      [...files]
        .filter(
          (e) =>
            (hiddenFilter === 'All files' || (hiddenFilter === 'Hidden files' ? isHidden(e) : !isHidden(e))) &&
            (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
            (appliedDirectories.length === 0 || appliedDirectories.includes(e.directory)) &&
            (extension === 'All extensions' || e.extension === extension) &&
            (count === 'All counts' || count === 'Unique only') &&
            (size === 'All sizes' ||
              (size === 'Under 10 MB' && e.size < 10000000) ||
              (size === '10–25 MB' && e.size >= 10000000 && e.size <= 25000000) ||
              (size === 'Over 25 MB' && e.size > 25000000)),
        )
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [files, fileQuery, appliedDirectories, extension, count, size, hiddenFilter, isHidden],
  );

  const pageLimit = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(list.length / pageLimit));
  const pageRows = list.slice((page - 1) * pageLimit, page * pageLimit);

  useEffect(() => {
    setPage(1);
  }, [fileQuery, appliedDirectories, extension, count, size, hiddenFilter, pageSize, list.length]);

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
          <DirectoryPicker applied={appliedDirectories} options={directoryOptions} onApply={setAppliedDirectories} />
          {hiddenEnabled && (
            <Select
              aria-label="Hidden filter"
              value={hiddenFilter}
              onChange={(v) => setHiddenFilter(v ?? 'Active files')}
              data={['Active files', 'Hidden files', 'All files']}
            />
          )}
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
        <Group gap="8">
          {hiddenEnabled && (
            <Text size="sm" c="dimmed">
              {hiddenCount} hidden
            </Text>
          )}
          {hiddenEnabled && hiddenFilter === 'Hidden files' && hiddenCount > 0 && (
            <Button variant="subtle" size="xs" onClick={onClearHidden}>
              Restore all
            </Button>
          )}
          <Text size="sm" c="dimmed">
            {list.length} files found
          </Text>
        </Group>
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
          {pageRows.map((e) => (
            <Table.Tr key={e.id} onClick={() => onSelect(e)} className="file-table-row">
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500} truncate>
                    {e.filename}
                  </Text>
                  {hiddenEnabled && isHidden(e) && (
                    <Badge size="xs" variant="light" color="gray">
                      Hidden
                    </Badge>
                  )}
                </Group>
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
                  <Group gap={4} justify="flex-end" wrap="nowrap">
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
                    {hiddenEnabled && isHidden(e) && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUnhide?.(e.path);
                        }}
                      >
                        Unhide
                      </Button>
                    )}
                    {hiddenEnabled && !isHidden(e) && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          onHide?.(e.path);
                        }}
                      >
                        Hide
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group className="analytics-pagination" justify="space-between" mt="md">
        <Select
          aria-label="Items per page"
          value={pageSize}
          onChange={(v) => setPageSize(v ?? '25')}
          data={['10', '25', '50']}
          w={80}
        />
        <Group gap="8">
          <Button variant="subtle" size="xs" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Text size="xs" c="dimmed">
            Page {page} of {pageCount}
          </Text>
          <Button
            variant="subtle"
            size="xs"
            disabled={page === pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </Group>
      </Group>
    </>
  );
}
