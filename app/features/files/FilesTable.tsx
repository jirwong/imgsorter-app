import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Checkbox, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { DirectoryPicker } from '../../components/common/DirectoryPicker';
import { normalizeDirectoryKey } from '../../lib/directory-path';
import { formatBytes } from '../../lib/format';
import type { Entry, FilesQuery, FilesResult } from '../../lib/types';

export type FilesTableProps = {
  data: FilesResult;
  loading: boolean;
  lockedDirs?: string[];
  hidden?: string[];
  onHide?: (path: string) => void;
  onHideMany?: (paths: string[]) => void;
  onUnhide?: (path: string) => void;
  onUnhideMany?: (paths: string[]) => void;
  onClearHidden?: () => void;
  onQueryChange: (query: FilesQuery) => void;
  onSelect: (e: Entry) => void;
};

const SIZE_FILTERS: Record<string, FilesQuery['sizeFilter']> = {
  'All sizes': 'all',
  'Under 10 MB': 'under10',
  '10–25 MB': '10to25',
  'Over 25 MB': 'over25',
};

const HIDDEN_FILTERS: Record<string, FilesQuery['hiddenMode']> = {
  'Active files': 'active',
  'Hidden files': 'hidden',
  'All files': 'all',
};

function toPageSize(value: string): FilesQuery['pageSize'] {
  switch (value) {
    case '10':
      return 10;
    case '50':
      return 50;
    case '100':
      return 100;
    default:
      return 25;
  }
}

export function FilesTable({
  data,
  loading,
  lockedDirs,
  hidden,
  onHide,
  onHideMany,
  onUnhide,
  onUnhideMany,
  onClearHidden,
  onQueryChange,
  onSelect,
}: FilesTableProps) {
  const [fileQuery, setFileQuery] = useState('');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [size, setSize] = useState('All sizes');
  const [extension, setExtension] = useState('All extensions');
  const [hiddenFilter, setHiddenFilter] = useState('Active files');
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [pageSize, setPageSize] = useState('25');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<FilesQuery['sortKey']>('location');
  const [direction, setDirection] = useState<FilesQuery['direction']>('asc');
  const sentQuery = useRef(false);
  const lockedKey = [...(lockedDirs ?? [])].sort().join('|');
  const [lockedPageKey, setLockedPageKey] = useState(lockedKey);

  if (lockedPageKey !== lockedKey) {
    setLockedPageKey(lockedKey);
    setPage(1);
  }

  const selectedDirs = useMemo(
    () => [...new Set([...(lockedDirs ?? []), ...appliedDirectories])],
    [lockedDirs, appliedDirectories],
  );

  const hiddenEnabled =
    hidden !== undefined &&
    onHide !== undefined &&
    onHideMany !== undefined &&
    onUnhide !== undefined &&
    onUnhideMany !== undefined &&
    onClearHidden !== undefined;
  const hiddenKeys = useMemo(() => new Set((hidden ?? []).map(normalizeDirectoryKey)), [hidden]);
  const isHidden = (e: Entry) => hiddenKeys.has(normalizeDirectoryKey(e.path));

  const directoryOptions = useMemo(
    () =>
      data.directoryCounts.map((item) => ({
        value: item.path,
        label: item.path,
        count: item.count,
        ...(hiddenEnabled ? { hidden: item.hidden } : {}),
      })),
    [data.directoryCounts, hiddenEnabled],
  );
  const extensions = useMemo(() => data.extensionCounts.map((item) => item.extension), [data.extensionCounts]);
  const selectedPaths = useMemo(() => [...selected.values()], [selected]);

  const pageLimit = toPageSize(pageSize);
  const pageCount = Math.max(1, Math.ceil(data.total / pageLimit));
  const pageRows = data.files;
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((e) => selected.has(e.id));
  const someVisibleSelected = pageRows.some((e) => selected.has(e.id));

  const query: FilesQuery = {
    query: fileQuery,
    selectedDirs,
    extensions: extension === 'All extensions' ? [] : [extension],
    sizeFilter: SIZE_FILTERS[size] ?? 'all',
    hiddenMode: HIDDEN_FILTERS[hiddenFilter] ?? 'active',
    page,
    pageSize: pageLimit,
    sortKey,
    direction,
  };

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (!sentQuery.current) {
      sentQuery.current = true;
      return;
    }
    onQueryChange(query);
  }, [fileQuery, selectedDirs, extension, size, hiddenFilter, page, pageSize, sortKey, direction]);

  const toggleSelected = (id: number, path: string) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, path);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Map(current);
      if (allVisibleSelected) pageRows.forEach((e) => next.delete(e.id));
      else pageRows.forEach((e) => next.set(e.id, e.path));
      return next;
    });
  };

  const dropSelected = (id: number) => {
    setSelected((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  };

  const hideOne = (e: Entry) => {
    onHide?.(e.path);
    dropSelected(e.id);
  };

  const unhideOne = (e: Entry) => {
    onUnhide?.(e.path);
    dropSelected(e.id);
  };

  const hideSelected = () => {
    onHideMany?.(selectedPaths);
    setSelected(new Map());
  };

  const unhideSelected = () => {
    onUnhideMany?.(selectedPaths);
    setSelected(new Map());
  };

  const headerClick = (key: FilesQuery['sortKey']) => {
    if (sortKey === key) {
      setDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection(key === 'size' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const arrow = (key: FilesQuery['sortKey']) => (sortKey === key ? (direction === 'asc' ? '↑' : '↓') : '');

  const header = (key: FilesQuery['sortKey'], label: string) => (
    <Table.Th className="sortable-th" onClick={() => headerClick(key)}>
      {label} {arrow(key)}
    </Table.Th>
  );

  const filters = (
    <>
      <TextInput
        value={fileQuery}
        onChange={(event) => {
          setFileQuery(event.currentTarget.value);
          setPage(1);
        }}
        placeholder="Filter filename or path"
        leftSection={<Search size={15} />}
      />
      <DirectoryPicker
        applied={appliedDirectories}
        options={directoryOptions}
        onApply={(dirs) => {
          setAppliedDirectories(dirs);
          setPage(1);
        }}
      />
      {hiddenEnabled && (
        <Select
          aria-label="Hidden filter"
          value={hiddenFilter}
          onChange={(v) => {
            setHiddenFilter(v ?? 'Active files');
            setPage(1);
          }}
          data={['Active files', 'Hidden files', 'All files']}
        />
      )}
      <Select
        aria-label="Size filter"
        value={size}
        onChange={(v) => {
          setSize(v ?? 'All sizes');
          setPage(1);
        }}
        data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']}
      />
      <Select
        aria-label="Extension filter"
        value={extension}
        onChange={(v) => {
          setExtension(v ?? 'All extensions');
          setPage(1);
        }}
        data={['All extensions', ...extensions]}
      />
    </>
  );

  const controls = (
    <>
      {hiddenEnabled && pageRows.length > 0 && (
        <Button variant="subtle" size="xs" onClick={toggleAllVisible}>
          {allVisibleSelected ? 'Deselect all' : 'Select all'}
        </Button>
      )}
      {hiddenEnabled && selectedPaths.length > 0 && (
        <>
          <Text size="sm" c="dimmed">
            {selectedPaths.length} selected
          </Text>
          <Button variant="light" size="xs" onClick={hiddenFilter === 'Hidden files' ? unhideSelected : hideSelected}>
            {hiddenFilter === 'Hidden files' ? 'Unhide selected' : 'Hide selected'}
          </Button>
        </>
      )}
      {hiddenEnabled && (
        <Text size="sm" c="dimmed">
          {data.hiddenCount} hidden
        </Text>
      )}
      {hiddenEnabled && hiddenFilter === 'Hidden files' && data.hiddenCount > 0 && (
        <Button variant="subtle" size="xs" onClick={onClearHidden}>
          Restore all
        </Button>
      )}
      {loading && (
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      )}
      <Text size="sm" c="dimmed">
        {data.total} files found
      </Text>
    </>
  );

  return (
    <>
      {hiddenEnabled ? (
        <Stack className="files-filter-rows" gap="8" mb="md">
          <Group className="duplicate-filters" gap="8">
            {filters}
          </Group>
          <Group gap="8">{controls}</Group>
        </Stack>
      ) : (
        <Group className="duplicate-filters" justify="space-between" mb="md">
          <Group gap="8">{filters}</Group>
          <Group gap="8">{controls}</Group>
        </Group>
      )}
      <Table className="files-table" highlightOnHover aria-busy={loading}>
        <Table.Thead>
          <Table.Tr>
            {hiddenEnabled && (
              <Table.Th w={40}>
                {pageRows.length > 0 && (
                  <Checkbox
                    aria-label="Select all visible rows"
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                )}
              </Table.Th>
            )}
            {header('filename', 'Filename')}
            {header('location', 'Location')}
            {header('type', 'Type')}
            {header('size', 'Size')}
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pageRows.map((e) => (
            <Table.Tr key={e.id} onClick={() => onSelect(e)} className="file-table-row">
              {hiddenEnabled && (
                <Table.Td>
                  <Checkbox
                    aria-label={`Select ${e.filename}`}
                    checked={selected.has(e.id)}
                    onChange={() => toggleSelected(e.id, e.path)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </Table.Td>
              )}
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
                        unhideOne(e);
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
                        hideOne(e);
                      }}
                    >
                      Hide
                    </Button>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group className="analytics-pagination" justify="space-between" mt="md">
        <Select
          aria-label="Items per page"
          value={pageSize}
          onChange={(v) => {
            setPageSize(v ?? '25');
            setPage(1);
          }}
          data={['10', '25', '50', '100']}
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
