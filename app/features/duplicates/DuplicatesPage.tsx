import { useMemo, useState } from 'react';
import { Alert, Button, Group, Select, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Search } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { DuplicateGroupTable } from './DuplicateGroupTable';
import { DirectoryPicker } from './DirectoryPicker';
import { matchesKeeperFilter, type KeeperFilterValue } from './keeper-filter';
import { useApp } from '../../lib/app-context';
import { clearStaleKeepers, saveKeepers } from '../../../server/routes/duplicates';
import type { DuplicateGroup, KeeperMap } from '../../lib/types';

export function DuplicatesPage({
  groups,
  initialKeepers,
  initialStaleKeepers,
}: {
  groups: DuplicateGroup[];
  initialKeepers: KeeperMap;
  initialStaleKeepers: number;
}) {
  const { setSelectedFile } = useApp();
  const [keeperByGroup, setKeeperByGroup] = useState<KeeperMap>(initialKeepers);
  const [staleKeepers, setStaleKeepers] = useState(initialStaleKeepers);
  const [fileQuery, setFileQuery] = useState('');
  const [extension, setExtension] = useState('All extensions');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [countFilter, setCountFilter] = useState('All counts');
  const [sizeFilter, setSizeFilter] = useState('All sizes');
  const [keeperFilter, setKeeperFilter] = useState<KeeperFilterValue>('All groups');

  const directories = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.directory)))], [groups]);
  const extensions = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.extension)))], [groups]);
  const directoryOptions = useMemo(
    () =>
      directories.map((d) => ({
        value: d,
        label: d,
        count: groups.filter((g) => g.files.some((e) => e.directory === d)).length,
      })),
    [directories, groups],
  );

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          files: g.files.filter(
            (e) =>
              (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
              (appliedDirectories.length === 0 || appliedDirectories.includes(e.directory)) &&
              (extension === 'All extensions' || e.extension === extension),
          ),
        }))
        .filter(
          (g) =>
            g.files.length &&
            (countFilter === 'All counts' ||
              (countFilter === '2 files' && g.count === 2) ||
              (countFilter === '3+ files' && g.count >= 3)) &&
            (sizeFilter === 'All sizes' ||
              (sizeFilter === 'Under 10 MB' && g.size < 10000000) ||
              (sizeFilter === '10–25 MB' && g.size >= 10000000 && g.size <= 25000000) ||
              (sizeFilter === 'Over 25 MB' && g.size > 25000000)) &&
            matchesKeeperFilter(g, keeperByGroup, keeperFilter),
        ),
    [fileQuery, extension, appliedDirectories, countFilter, sizeFilter, keeperFilter, keeperByGroup, groups],
  );

  const visibleFiles = useMemo(() => visibleGroups.reduce((n, g) => n + g.files.length, 0), [visibleGroups]);

  const toggleKeeper = (groupKey: string, id: number) => {
    const next = { ...keeperByGroup };
    if (next[groupKey] === id) delete next[groupKey];
    else next[groupKey] = id;
    setKeeperByGroup(next);
    void saveKeepers({ data: { keepers: next } })
      .then(() => setStaleKeepers(0))
      .catch(() => notifications.show({ color: 'red', message: 'Could not save keepers.' }));
  };

  const clearStale = () => {
    void clearStaleKeepers()
      .then(() => setStaleKeepers(0))
      .catch(() => notifications.show({ color: 'red', message: 'Could not clear keepers.' }));
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
            onChange={(event) => setFileQuery(event.currentTarget.value)}
            leftSection={<Search size={14} />}
          />
          <DirectoryPicker applied={appliedDirectories} options={directoryOptions} onApply={setAppliedDirectories} />
          <Select
            size="xs"
            value={countFilter}
            onChange={(v) => setCountFilter(v ?? 'All counts')}
            data={['All counts', '2 files', '3+ files']}
          />
          <Select
            size="xs"
            value={sizeFilter}
            onChange={(v) => setSizeFilter(v ?? 'All sizes')}
            data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']}
          />
          <Select
            size="xs"
            value={extension}
            onChange={(v) => setExtension(v ?? 'All extensions')}
            data={['All extensions', ...extensions]}
          />
          <Select
            size="xs"
            aria-label="Keeper filter"
            value={keeperFilter}
            onChange={(v) => setKeeperFilter((v as KeeperFilterValue) ?? 'All groups')}
            data={['All groups', 'With keeper', 'Without keeper']}
          />
          <Text size="xs" c="dimmed" className="filter-count">
            {visibleGroups.length} groups · {visibleFiles} files · {Object.keys(keeperByGroup).length} keepers
          </Text>
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
          groups={visibleGroups}
          keeperByGroup={keeperByGroup}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
        />
      </div>
    </>
  );
}
