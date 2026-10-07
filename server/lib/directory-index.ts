import '@tanstack/react-start/server-only';
import type { ConfiguredRoot, DirectoryNode, DirectoryStat } from '../../app/lib/types';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';
import { getDirectoryStats } from './queries';

function nodeLabel(segments: string[]): string {
  if (segments.length === 1) {
    return /^[A-Za-z]:$/.test(segments[0]) ? `${segments[0]}\\` : segments[0];
  }
  return segments[segments.length - 1];
}

function ensureNode(index: Map<string, DirectoryNode>, path: string): DirectoryNode {
  const existing = index.get(path);
  if (existing) return existing;
  const segments = path.split('/');
  const node: DirectoryNode = { label: nodeLabel(segments), path, fileCount: 0, size: 0, children: [] };
  index.set(path, node);
  if (segments.length > 1) {
    ensureNode(index, segments.slice(0, -1).join('/')).children.push(node);
  }
  return node;
}

function aggregate(node: DirectoryNode): void {
  let fileCount = node.fileCount;
  let size = node.size;
  for (const child of node.children) {
    aggregate(child);
    fileCount += child.fileCount;
    size += child.size;
  }
  node.fileCount = fileCount;
  node.size = size;
}

function markLibrary(nodes: DirectoryNode[], within: boolean): void {
  for (const node of nodes) {
    const inside = within || node.isRoot === true;
    if (inside) node.inLibrary = true;
    markLibrary(node.children, inside);
  }
}

function sortTree(nodes: DirectoryNode[]): void {
  nodes.sort((a, b) => a.label.localeCompare(b.label));
  for (const node of nodes) sortTree(node.children);
}

export function buildDirectoryIndex(roots: ConfiguredRoot[], stats: DirectoryStat[]): DirectoryNode[] {
  const index = new Map<string, DirectoryNode>();
  for (const stat of stats) {
    const path = normalizeDirectoryPath(stat.path);
    if (!path) continue;
    const node = ensureNode(index, path);
    node.fileCount += stat.fileCount;
    node.size += stat.size;
  }
  for (const root of roots) {
    const path = normalizeDirectoryPath(root.path);
    if (!path) continue;
    const node = ensureNode(index, path);
    node.isRoot = true;
    if (root.lastScannedAt) node.lastScannedAt = root.lastScannedAt;
  }
  const top = [...index.values()].filter((node) => !node.path.includes('/'));
  for (const node of top) aggregate(node);
  markLibrary(top, false);
  sortTree(top);
  return top;
}

export function getDirectoryIndex(): DirectoryNode[] {
  const config = appConfigStore.get();
  const roots: ConfiguredRoot[] = config.directories.indexed
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      path: entry.path,
      lastScannedAt: config.directoryMeta[normalizeDirectoryPath(entry.path).toLowerCase()]?.lastScannedAt,
    }));
  const scope = roots.map((root) => normalizeDirectoryPath(root.path));
  return buildDirectoryIndex(roots, getDirectoryStats(scope));
}
