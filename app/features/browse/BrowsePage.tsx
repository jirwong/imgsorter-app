import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTree } from '../../components/common/DirectoryTree';
import { FilesTable } from '../files/FilesTable';
import { useApp } from '../../lib/app-context';

export function BrowsePage() {
  const { filtered, setSelectedFile } = useApp();

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Browse"
        subtitle="Explore browse across your indexed media library."
        showExport
      />
      <div className="browse-layout">
        <DirectoryTree />
        <div className="browse-results">
          <FilesTable files={filtered} onSelect={setSelectedFile} />
        </div>
      </div>
    </>
  );
}
