import { useMemo, useState } from 'react';
import { Group, Select, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { DuplicateGroupTable } from './DuplicateGroupTable';
import { DirectoryPicker } from './DirectoryPicker';
import { groups } from '../../lib/mock-data';
import { useApp } from '../../lib/app-context';

export function DuplicatesPage() {
  const { keepers, toggleKeeper, setSelectedFile } = useApp();
  const [fileQuery, setFileQuery] = useState('');
  const [extension, setExtension] = useState('All extensions');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [countFilter, setCountFilter] = useState('All counts');
  const [sizeFilter, setSizeFilter] = useState('All sizes');

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
              (sizeFilter === 'Under 10 MB' && g.files[0].size < 10000000) ||
              (sizeFilter === '10–25 MB' && g.files[0].size >= 10000000 && g.files[0].size <= 25000000) ||
              (sizeFilter === 'Over 25 MB' && g.files[0].size > 25000000)),
        ),
    [fileQuery, extension, appliedDirectories, countFilter, sizeFilter, groups],
  );

  const visibleFiles = useMemo(() => visibleGroups.reduce((n, g) => n + g.files.length, 0), [visibleGroups]);

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
          <Text size="xs" c="dimmed" className="filter-count">
            {visibleGroups.length} groups · {visibleFiles} files · {keepers.length} keepers
          </Text>
        </Group>
        <DuplicateGroupTable
          groups={visibleGroups}
          keepers={keepers}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
        />
      </div>
    </>
  );
}
