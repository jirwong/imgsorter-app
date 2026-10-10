import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { PageHeading } from '../../components/common/PageHeading';
import { FilesTable } from './FilesTable';
import { useApp } from '../../lib/app-context';
import { normalizeDirectoryKey } from '../../lib/directory-path';
import { clearHidden, hideFile, unhideFile } from '../../../server/routes/hidden';
import type { Entry } from '../../lib/types';

export function FilesPage({ files, hidden }: { files: Entry[]; hidden: string[] }) {
  const { setSelectedFile } = useApp();
  const [hiddenFiles, setHiddenFiles] = useState(hidden);

  const apply = (next: string[], run: () => Promise<{ hidden: string[] }>) => {
    const previous = hiddenFiles;
    setHiddenFiles(next);
    void run()
      .then((result) => setHiddenFiles(result.hidden))
      .catch(() => {
        setHiddenFiles(previous);
        notifications.show({ color: 'red', message: 'Could not save hidden files.' });
      });
  };

  const hide = (path: string) => apply([...hiddenFiles, path], () => hideFile({ data: { path } }));

  const unhide = (path: string) => {
    const key = normalizeDirectoryKey(path);
    apply(
      hiddenFiles.filter((item) => normalizeDirectoryKey(item) !== key),
      () => unhideFile({ data: { path } }),
    );
  };

  const restoreAll = () => apply([], () => clearHidden());

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Unique Files"
        subtitle="Explore unique files across your indexed media library."
        showExport
      />
      <FilesTable
        files={files}
        unique
        hidden={hiddenFiles}
        onHide={hide}
        onUnhide={unhide}
        onClearHidden={restoreAll}
        onSelect={setSelectedFile}
      />
    </>
  );
}
