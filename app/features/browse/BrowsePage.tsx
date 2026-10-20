import { useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTree } from '../../components/common/DirectoryTree';
import { FilesTable } from '../files/FilesTable';
import { useApp } from '../../lib/app-context';
import { getBrowseData } from '../../../server/routes/browse';
import type { DirectoryNode, FilesQuery, FilesResult } from '../../lib/types';

export const DEFAULT_BROWSE_QUERY: FilesQuery = {
  query: '',
  selectedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 25,
  sortKey: 'location',
  direction: 'asc',
};

type BrowseResult = FilesResult & { tree: DirectoryNode[] };

export function BrowsePage({ initial, selectedDirs }: { initial: BrowseResult; selectedDirs: string[] }) {
  const { setSelectedFile } = useApp();
  const [query, setQuery] = useState<FilesQuery>(() => ({ ...DEFAULT_BROWSE_QUERY, selectedDirs }));
  const [data, setData] = useState<FilesResult>(initial);
  const [tree, setTree] = useState<DirectoryNode[]>(initial.tree);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const initialised = useRef(false);
  const loaderData = useRef(initial);
  const loaderDirs = useRef(selectedDirs);
  const requestId = useRef(0);

  useEffect(() => {
    if (loaderData.current === initial) return;
    loaderData.current = initial;
    setTree(initial.tree);
    setRevision((value) => value + 1);
  }, [initial]);

  useEffect(() => {
    if (loaderDirs.current === selectedDirs) return;
    loaderDirs.current = selectedDirs;
    setQuery((current) => ({ ...current, selectedDirs, page: 1 }));
  }, [selectedDirs]);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    let cancelled = false;
    const id = ++requestId.current;
    setLoading(true);
    getBrowseData({ data: query })
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
        setTree(result.tree);
      })
      .catch(() => {
        if (!cancelled && id === requestId.current) {
          notifications.show({ color: 'red', message: 'Could not load files.' });
        }
      })
      .finally(() => {
        if (!cancelled && id === requestId.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, revision]);

  const applyQuery = (next: FilesQuery) => {
    setQuery({ ...next, selectedDirs: [...new Set([...selectedDirs, ...next.selectedDirs])] });
  };

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Browse"
        subtitle="Explore browse across your indexed media library."
      />
      <div className="browse-layout">
        <DirectoryTree tree={tree} />
        <div className="browse-results">
          <FilesTable data={data} loading={loading} onQueryChange={applyQuery} onSelect={setSelectedFile} />
        </div>
      </div>
    </>
  );
}
