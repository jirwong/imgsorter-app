import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Select, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Search } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { DuplicateGroupTable } from './DuplicateGroupTable';
import { DirectoryPicker } from '../../components/common/DirectoryPicker';
import { useApp } from '../../lib/app-context';
import { normalizeDirectoryKey } from '../../lib/directory-path';
import { clearStaleKeepers, getDuplicatesData, saveKeepers } from '../../../server/routes/duplicates';
import { clearHidden, hideFile, hideFiles, unhideFile, unhideFiles } from '../../../server/routes/hidden';
import type { DuplicatesQuery, DuplicatesResult, Entry, KeeperMap } from '../../lib/types';

type KeeperFilterValue = 'All groups' | 'With keeper' | 'Without keeper';

export const DEFAULT_DUPLICATES_QUERY: DuplicatesQuery = {
  query: '',
  selectedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  countFilter: 'all',
  keeperFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 25,
  sortKey: 'count',
  direction: 'desc',
};

const COUNT_FILTERS: Record<string, DuplicatesQuery['countFilter']> = {
  'All counts': 'all',
  '2 files': '2',
  '3+ files': '3+',
};

const SIZE_FILTERS: Record<string, DuplicatesQuery['sizeFilter']> = {
  'All sizes': 'all',
  'Under 10 MB': 'under10',
  '10–25 MB': '10to25',
  'Over 25 MB': 'over25',
};

const HIDDEN_FILTERS: Record<string, DuplicatesQuery['hiddenMode']> = {
  'Active files': 'active',
  'Hidden files': 'hidden',
  'All files': 'all',
};

const KEEPER_FILTERS: Record<KeeperFilterValue, DuplicatesQuery['keeperFilter']> = {
  'All groups': 'all',
  'With keeper': 'with',
  'Without keeper': 'without',
};

function toPageSize(value: string): DuplicatesQuery['pageSize'] {
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

export function DuplicatesPage({ initial, hidden }: { initial: DuplicatesResult; hidden: string[] }) {
  const { setSelectedFile } = useApp();
  const [data, setData] = useState(initial);
  const [keeperByGroup, setKeeperByGroup] = useState<KeeperMap>(initial.keepers);
  const [staleKeepers, setStaleKeepers] = useState(initial.staleKeepers);
  const [hiddenFiles, setHiddenFiles] = useState(hidden);
  const [hiddenMode, setHiddenMode] = useState('Active files');
  const [fileQuery, setFileQuery] = useState('');
  const [extension, setExtension] = useState('All extensions');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [countFilter, setCountFilter] = useState('All counts');
  const [sizeFilter, setSizeFilter] = useState('All sizes');
  const [keeperFilter, setKeeperFilter] = useState<KeeperFilterValue>('All groups');
  const [sortKey, setSortKey] = useState<DuplicatesQuery['sortKey']>('count');
  const [direction, setDirection] = useState<DuplicatesQuery['direction']>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('25');
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const initialised = useRef(false);
  const loaderData = useRef(initial);
  const loaderHidden = useRef(hidden);
  const requestId = useRef(0);

  const query = useMemo<DuplicatesQuery>(
    () => ({
      query: fileQuery,
      selectedDirs: appliedDirectories,
      extensions: extension === 'All extensions' ? [] : [extension],
      sizeFilter: SIZE_FILTERS[sizeFilter] ?? 'all',
      countFilter: COUNT_FILTERS[countFilter] ?? 'all',
      keeperFilter: KEEPER_FILTERS[keeperFilter] ?? 'all',
      hiddenMode: HIDDEN_FILTERS[hiddenMode] ?? 'active',
      page,
      pageSize: toPageSize(pageSize),
      sortKey,
      direction,
    }),
    [
      fileQuery,
      appliedDirectories,
      extension,
      sizeFilter,
      countFilter,
      keeperFilter,
      hiddenMode,
      page,
      pageSize,
      sortKey,
      direction,
    ],
  );

  useEffect(() => {
    if (loaderData.current === initial) return;
    loaderData.current = initial;
    setRevision((value) => value + 1);
  }, [initial]);

  useEffect(() => {
    if (loaderHidden.current === hidden) return;
    loaderHidden.current = hidden;
    setHiddenFiles(hidden);
  }, [hidden]);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    let cancelled = false;
    const id = ++requestId.current;
    setLoading(true);
    getDuplicatesData({ data: query })
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
      })
      .catch(() => {
        if (!cancelled && id === requestId.current) {
          notifications.show({ color: 'red', message: 'Could not load duplicates.' });
        }
      })
      .finally(() => {
        if (!cancelled && id === requestId.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, revision]);

  const pageCount = Math.max(1, Math.ceil(data.totalGroups / toPageSize(pageSize)));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const extensionOptions = useMemo(
    () => ['All extensions', ...data.extensionCounts.map((item) => item.extension)],
    [data.extensionCounts],
  );

  const hiddenKeys = useMemo(() => new Set(hiddenFiles.map(normalizeDirectoryKey)), [hiddenFiles]);
  const isHidden = useCallback((entry: Entry) => hiddenKeys.has(normalizeDirectoryKey(entry.path)), [hiddenKeys]);

  const directoryOptions = useMemo(
    () =>
      data.directoryCounts.map((item) => ({
        value: item.path,
        label: item.path,
        count: item.count,
        hidden: item.hidden,
        unit: item.unit,
      })),
    [data.directoryCounts],
  );

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const selectedPaths = useMemo(() => [...selected.values()], [selected]);
  const entryPathById = useMemo(() => {
    const paths = new Map<number, string>();
    for (const group of data.groups) {
      for (const entry of group.files) paths.set(entry.id, entry.path);
    }
    return paths;
  }, [data.groups]);

  const visibleIds = useMemo(() => data.groups.flatMap((group) => group.files.map((entry) => entry.id)), [data.groups]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleKeeper = (groupKey: string, id: number) => {
    const next = { ...keeperByGroup };
    if (next[groupKey] === id) delete next[groupKey];
    else next[groupKey] = id;
    setKeeperByGroup(next);
    void saveKeepers({ data: { keepers: next } })
      .then(() => {
        setStaleKeepers(0);
        setRevision((value) => value + 1);
      })
      .catch(() => notifications.show({ color: 'red', message: 'Could not save keepers.' }));
  };

  const clearStale = () => {
    void clearStaleKeepers()
      .then(() => setStaleKeepers(0))
      .catch(() => notifications.show({ color: 'red', message: 'Could not clear keepers.' }));
  };

  const applyHidden = (next: string[], run: () => Promise<{ hidden: string[] }>) => {
    const previous = hiddenFiles;
    setHiddenFiles(next);
    void run()
      .then((result) => {
        setHiddenFiles(result.hidden);
        setRevision((value) => value + 1);
      })
      .catch(() => {
        setHiddenFiles(previous);
        notifications.show({ color: 'red', message: 'Could not save hidden files.' });
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

  const hideOne = (entry: Entry) => {
    applyHidden([...hiddenFiles, entry.path], () => hideFile({ data: { path: entry.path } }));
    dropSelected(entry.id);
  };

  const unhideOne = (entry: Entry) => {
    const key = normalizeDirectoryKey(entry.path);
    applyHidden(
      hiddenFiles.filter((path) => normalizeDirectoryKey(path) !== key),
      () => unhideFile({ data: { path: entry.path } }),
    );
    dropSelected(entry.id);
  };

  const toggleMany = (ids: number[]) => {
    setSelected((current) => {
      const next = new Map(current);
      const remove = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (remove) {
          next.delete(id);
          continue;
        }
        const path = entryPathById.get(id);
        if (path !== undefined) next.set(id, path);
      }
      return next;
    });
  };

  const hideSelected = () => {
    applyHidden([...hiddenFiles, ...selectedPaths], () => hideFiles({ data: { paths: selectedPaths } }));
    setSelected(new Map());
  };

  const unhideSelected = () => {
    const keys = new Set(selectedPaths.map(normalizeDirectoryKey));
    applyHidden(
      hiddenFiles.filter((path) => !keys.has(normalizeDirectoryKey(path))),
      () => unhideFiles({ data: { paths: selectedPaths } }),
    );
    setSelected(new Map());
  };

  const restoreAll = () => {
    applyHidden([], () => clearHidden());
    setSelected(new Map());
  };

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Duplicates"
        subtitle="Explore duplicates across your indexed media library."
      />
      <div className="duplicates-view">
        <Group className="duplicate-filters" gap="8" wrap="wrap">
          <TextInput
            size="xs"
            placeholder="Filter filename or path"
            value={fileQuery}
            onChange={(event) => {
              setFileQuery(event.currentTarget.value);
              setPage(1);
            }}
            leftSection={<Search size={14} />}
          />
          <DirectoryPicker
            applied={appliedDirectories}
            options={directoryOptions}
            onApply={(directories) => {
              setAppliedDirectories(directories);
              setPage(1);
            }}
          />
          <Select
            size="xs"
            aria-label="Count filter"
            value={countFilter}
            onChange={(v) => {
              setCountFilter(v ?? 'All counts');
              setPage(1);
            }}
            data={['All counts', '2 files', '3+ files']}
          />
          <Select
            size="xs"
            aria-label="Size filter"
            value={sizeFilter}
            onChange={(v) => {
              setSizeFilter(v ?? 'All sizes');
              setPage(1);
            }}
            data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']}
          />
          <Select
            size="xs"
            aria-label="Extension filter"
            value={extension}
            onChange={(v) => {
              setExtension(v ?? 'All extensions');
              setPage(1);
            }}
            data={extensionOptions}
          />
          <Select
            size="xs"
            aria-label="Hidden filter"
            value={hiddenMode}
            onChange={(v) => {
              setHiddenMode(v ?? 'Active files');
              setPage(1);
            }}
            data={['Active files', 'Hidden files', 'All files']}
          />
          <Select
            size="xs"
            aria-label="Keeper filter"
            value={keeperFilter}
            onChange={(v) => {
              setKeeperFilter((v as KeeperFilterValue) ?? 'All groups');
              setPage(1);
            }}
            data={['All groups', 'With keeper', 'Without keeper']}
          />
          <Text size="xs" c="dimmed">
            {data.totalGroups} groups · {data.totalFiles} files · {Object.keys(keeperByGroup).length} keepers
          </Text>
          <Text size="xs" c="dimmed">
            {data.hiddenCount} hidden
          </Text>
          {loading && (
            <Text size="xs" c="dimmed">
              Loading…
            </Text>
          )}
          <Button size="xs" variant="subtle" onClick={() => toggleMany(visibleIds)}>
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </Button>
          {selectedPaths.length > 0 && (
            <>
              <Text size="xs" c="dimmed">
                {selectedPaths.length} selected
              </Text>
              <Button size="xs" variant="light" onClick={hiddenMode === 'Hidden files' ? unhideSelected : hideSelected}>
                {hiddenMode === 'Hidden files' ? 'Unhide selected' : 'Hide selected'}
              </Button>
            </>
          )}
          {hiddenMode === 'Hidden files' && data.hiddenCount > 0 && (
            <Button size="xs" variant="subtle" onClick={restoreAll}>
              Restore all
            </Button>
          )}
        </Group>
        {staleKeepers > 0 && (
          <Alert color="orange" variant="light" mb="md">
            <Group justify="space-between">
              <Text size="sm">{staleKeepers} saved keepers no longer match a group.</Text>
              <Button size="xs" variant="light" color="orange" onClick={clearStale}>
                Clear saved keepers
              </Button>
            </Group>
          </Alert>
        )}
        <DuplicateGroupTable
          groups={data.groups}
          keeperByGroup={keeperByGroup}
          sortKey={sortKey}
          direction={direction}
          onSortChange={(key, nextDirection) => {
            setSortKey(key);
            setDirection(nextDirection);
            setPage(1);
          }}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
          isHidden={isHidden}
          onHide={hideOne}
          onUnhide={unhideOne}
          selected={selectedIds}
          onToggleMany={toggleMany}
        />
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
      </div>
    </>
  );
}
