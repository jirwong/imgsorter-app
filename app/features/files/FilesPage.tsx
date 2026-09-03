import { PageHeading } from '../../components/common/PageHeading';
import { FilesTable } from './FilesTable';
import { useApp } from '../../lib/app-context';

export function FilesPage() {
  const { filtered, setSelectedFile } = useApp();

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Unique Files"
        subtitle="Explore unique files across your indexed media library."
        showExport
      />
      <FilesTable files={filtered} unique onSelect={setSelectedFile} />
    </>
  );
}
