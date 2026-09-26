import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTree } from '../../components/common/DirectoryTree';
import { FilesTable } from '../files/FilesTable';
import { useApp } from '../../lib/app-context';
import type { DirectoryNode, Entry } from '../../lib/types';

export function BrowsePage({ files, tree }: { files: Entry[]; tree: DirectoryNode[] }) {
  const { setSelectedFile } = useApp();

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Browse"
        subtitle="Explore browse across your indexed media library."
        showExport
      />
      <div className="browse-layout">
        <DirectoryTree tree={tree} />
        <div className="browse-results">
          <FilesTable files={files} onSelect={setSelectedFile} />
        </div>
      </div>
    </>
  );
}
