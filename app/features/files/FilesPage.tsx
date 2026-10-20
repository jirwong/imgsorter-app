import { useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { PageHeading } from '../../components/common/PageHeading';
import { FilesTable } from './FilesTable';
import { useApp } from '../../lib/app-context';
import { normalizeDirectoryKey } from '../../lib/directory-path';
import { clearHidden, hideFile, hideFiles, unhideFile, unhideFiles } from '../../../server/routes/hidden';
import { getFilesPage } from '../../../server/routes/files';
import type { FilesQuery, FilesResult } from '../../lib/types';

export const DEFAULT_FILES_QUERY: FilesQuery = {
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

export function FilesPage({ initial, hidden }: { initial: FilesResult; hidden: string[] }) {
  const { setSelectedFile } = useApp();
  const [hiddenFiles, setHiddenFiles] = useState(hidden);
  const [query, setQuery] = useState<FilesQuery>(DEFAULT_FILES_QUERY);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const initialised = useRef(false);
  const loaderData = useRef(initial);
  const loaderHidden = useRef(hidden);
  const requestId = useRef(0);

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
    getFilesPage({ data: query })
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
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

  const apply = (next: string[], run: () => Promise<{ hidden: string[] }>) => {
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

  const hide = (path: string) => apply([...hiddenFiles, path], () => hideFile({ data: { path } }));

  const hideMany = (paths: string[]) => apply([...hiddenFiles, ...paths], () => hideFiles({ data: { paths } }));

  const unhide = (path: string) => {
    const key = normalizeDirectoryKey(path);
    apply(
      hiddenFiles.filter((item) => normalizeDirectoryKey(item) !== key),
      () => unhideFile({ data: { path } }),
    );
  };

  const unhideMany = (paths: string[]) => {
    const keys = new Set(paths.map(normalizeDirectoryKey));
    apply(
      hiddenFiles.filter((item) => !keys.has(normalizeDirectoryKey(item))),
      () => unhideFiles({ data: { paths } }),
    );
  };

  const restoreAll = () => apply([], () => clearHidden());

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Unique Files"
        subtitle="Explore unique files across your indexed media library."
      />
      <FilesTable
        data={data}
        loading={loading}
        hidden={hiddenFiles}
        onHide={hide}
        onHideMany={hideMany}
        onUnhide={unhide}
        onUnhideMany={unhideMany}
        onClearHidden={restoreAll}
        onQueryChange={setQuery}
        onSelect={setSelectedFile}
      />
    </>
  );
}
