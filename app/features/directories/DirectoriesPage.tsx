import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTreeTable } from './DirectoryTreeTable';
import type { DirectoryNode } from '../../lib/types';

export function DirectoriesPage({ tree }: { tree: DirectoryNode[] }) {
  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Directories"
        subtitle="Every indexed folder and subfolder in your library."
      />
      <DirectoryTreeTable tree={tree} />
    </>
  );
}
