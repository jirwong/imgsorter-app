import { PageHeading } from '../../components/common/PageHeading';
import { FilesTable } from './FilesTable';
import { useApp } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

export function FilesPage({ files }: { files: Entry[] }) {
  const { setSelectedFile } = useApp();

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Unique Files"
        subtitle="Explore unique files across your indexed media library."
        showExport
      />
      <FilesTable files={files} unique onSelect={setSelectedFile} />
    </>
  );
}
