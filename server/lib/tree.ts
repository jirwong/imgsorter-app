import type { DirectoryNode } from '../../app/lib/types';

const TOP_LABELS: { path: string; label: string }[] = [
  { path: 'C:/Media', label: 'Media (C:)' },
  { path: 'D:/Camera Imports', label: 'Camera Imports (D:)' },
  { path: 'Z:/Archive', label: 'Archive (Z:)' },
];

type MutableNode = { label: string; path: string; children: MutableNode[] };

export function buildDirectoryTree(directories: string[]): DirectoryNode[] {
  const top: MutableNode[] = [];
  const index = new Map<string, MutableNode>();
  for (const directory of [...new Set(directories)].sort()) {
    const segments = directory.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    const rootPath = segments.slice(0, 2).join('/');
    let node: MutableNode | undefined = index.get(rootPath);
    if (!node) {
      node = { label: segments[1] ?? segments[0], path: rootPath, children: [] };
      index.set(rootPath, node);
      top.push(node);
    }
    for (let depth = 2; depth < segments.length; depth += 1) {
      const path: string = `${node.path}/${segments[depth]}`;
      let child = index.get(path);
      if (!child) {
        child = { label: segments[depth], path, children: [] };
        index.set(path, child);
        node.children.push(child);
      }
      node = child;
    }
  }
  for (const root of top) {
    const entry = TOP_LABELS.find(({ path }) => path === root.path);
    if (entry) root.label = entry.label;
  }
  return top;
}
