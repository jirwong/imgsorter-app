import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
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
  onHideMany?: (paths: string[]) => void;
  onUnhide?: (path: string) => void;
  onUnhideMany?: (paths: string[]) => void;
  onClearHidden?: () => void;
  onSelect: (e: Entry) => void;
};

export function FilesTable({
  files,
  unique,
  hidden,
  onHide,
  onHideMany,
  onUnhide,
  onUnhideMany,
  onClearHidden,
  onSelect,
}: FilesTableProps) {
  const [fileQuery, setFileQuery] = useState('');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [count, setCount] = useState('All counts');
  const [size, setSize] = useState('All sizes');
  const [extension, setExtension] = useState('All extensions');
  const [hiddenFilter, setHiddenFilter] = useState('Active files');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState('25');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'filename' | 'location' | 'type' | 'size'>('location');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  const hiddenEnabled =
    hidden !== undefined &&
    onHide !== undefined &&
    onHideMany !== undefined &&
    onUnhide !== undefined &&
    onUnhideMany !== undefined &&
    onClearHidden !== undefined;
  const hiddenKeys = useMemo(() => new Set((hidden ?? []).map(normalizeDirectoryKey)), [hidden]);
  const isHidden = useCallback((e: Entry) => hiddenKeys.has(normalizeDirectoryKey(e.path)), [hiddenKeys]);

  const directories = useMemo(() => [...new Set(files.map((e) => e.directory))], [files]);
  const directoryOptions = useMemo(() => {
    const counts = new Map<string, { count: number; hidden: number }>();
    for (const e of files) {
      const entry = counts.get(e.directory) ?? { count: 0, hidden: 0 };
      entry.count += 1;
      if (hiddenEnabled && isHidden(e)) entry.hidden += 1;
      counts.set(e.directory, entry);
    }
    return directories.map((d) => {
      const countsForDir = counts.get(d) ?? { count: 0, hidden: 0 };
      return {
        value: d,
        label: d,
        count: countsForDir.count,
        ...(hiddenEnabled ? { hidden: countsForDir.hidden } : {}),
      };
    });
  }, [directories, files, hiddenEnabled, isHidden]);
  const extensions = useMemo(() => [...new Set(files.map((e) => e.extension))], [files]);
  const hiddenCount = useMemo(() => files.filter((e) => isHidden(e)).length, [files, isHidden]);
  const selectedPaths = useMemo(() => files.filter((e) => selected.has(e.id)).map((e) => e.path), [files, selected]);

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
        .sort((a, b) => {
          if (!unique) return a.filename.localeCompare(b.filename);
          const av =
            sortKey === 'size'
              ? a.size
              : sortKey === 'filename'
                ? a.filename
                : sortKey === 'location'
                  ? a.directory
                  : a.extension;
          const bv =
            sortKey === 'size'
              ? b.size
              : sortKey === 'filename'
                ? b.filename
                : sortKey === 'location'
                  ? b.directory
                  : b.extension;
          const result =
            typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
          return direction === 'asc' ? result : -result;
        }),
    [files, fileQuery, appliedDirectories, extension, count, size, hiddenFilter, isHidden, unique, sortKey, direction],
  );

  const pageLimit = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(list.length / pageLimit));
  const pageRows = list.slice((page - 1) * pageLimit, page * pageLimit);
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((e) => selected.has(e.id));
  const someVisibleSelected = pageRows.some((e) => selected.has(e.id));

  useEffect(() => {
    setPage(1);
  }, [fileQuery, appliedDirectories, extension, count, size, hiddenFilter, sortKey, direction, pageSize, list.length]);

  const toggleSelected = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) pageRows.forEach((e) => next.delete(e.id));
      else pageRows.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const dropSelected = (id: number) => {
    setSelected((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
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
    setSelected(new Set());
  };

  const unhideSelected = () => {
    onUnhideMany?.(selectedPaths);
    setSelected(new Set());
  };

  const headerClick = (key: 'filename' | 'location' | 'type' | 'size') => {
    if (sortKey === key) {
      setDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection(key === 'size' ? 'desc' : 'asc');
    }
  };

  const arrow = (key: 'filename' | 'location' | 'type' | 'size') =>
    sortKey === key ? (direction === 'asc' ? '↑' : '↓') : '';

  const header = (key: 'filename' | 'location' | 'type' | 'size', label: string) => (
    <Table.Th className={unique ? 'sortable-th' : undefined} onClick={unique ? () => headerClick(key) : undefined}>
      {label}
      {unique ? ` ${arrow(key)}` : ''}
    </Table.Th>
  );

  const filters = (
    <>
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
    </>
  );

  return (
    <>
      {unique ? (
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
      <Table className="files-table" highlightOnHover>
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
            {unique && <Table.Th>Actions</Table.Th>}
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
                    onChange={() => toggleSelected(e.id)}
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
