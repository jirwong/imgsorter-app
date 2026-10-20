import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTree } from '../../components/common/DirectoryTree';
import { FilesTable } from '../files/FilesTable';
import { useApp } from '../../lib/app-context';
import type { DirectoryNode, Entry, FilesResult } from '../../lib/types';

function toFilesResult(files: Entry[]): FilesResult {
  const directories = new Map<string, { count: number; hidden: number }>();
  const extensions = new Map<string, number>();
  for (const entry of files) {
    const counts = directories.get(entry.directory) ?? { count: 0, hidden: 0 };
    counts.count += 1;
    directories.set(entry.directory, counts);
    extensions.set(entry.extension, (extensions.get(entry.extension) ?? 0) + 1);
  }
  return {
    files,
    total: files.length,
    directoryCounts: [...directories.entries()].map(([path, counts]) => ({
      path,
      count: counts.count,
      hidden: counts.hidden,
    })),
    extensionCounts: [...extensions.entries()].map(([extension, count]) => ({ extension, count })),
    hiddenCount: 0,
  };
}

export function BrowsePage({ files, tree }: { files: Entry[]; tree: DirectoryNode[] }) {
  const { setSelectedFile } = useApp();

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
          <FilesTable data={toFilesResult(files)} loading={false} onQueryChange={() => {}} onSelect={setSelectedFile} />
        </div>
      </div>
    </>
  );
}
