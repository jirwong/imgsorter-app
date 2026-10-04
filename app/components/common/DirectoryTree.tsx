import { useState, type ReactElement } from 'react';
import { Checkbox, Text } from '@mantine/core';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type { DirectoryNode } from '../../lib/types';
import { useApp } from '../../lib/app-context';

export function DirectoryTree({ tree }: { tree: DirectoryNode[] }) {
  const { selectedDirs, toggleSelectedDir } = useApp();
  const [nodeOpen, setNodeOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const node of tree) initial[node.path] = true;
    return initial;
  });

  const render = (node: DirectoryNode, depth: number): ReactElement => {
    const hasChildren = node.children.length > 0;
    const isOpen = nodeOpen[node.path] ?? false;
    return (
      <div key={node.path}>
        <div className="directory-node" style={{ paddingLeft: depth * 14 }}>
          <button
            className="directory-expand"
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={() => hasChildren && setNodeOpen((state) => ({ ...state, [node.path]: !isOpen }))}
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )
            ) : (
              <span className="directory-spacer" />
            )}
          </button>
          <Checkbox
            checked={selectedDirs.includes(node.path)}
            onChange={() => toggleSelectedDir(node.path)}
            aria-label={`Filter ${node.label}`}
          />
          <FolderOpen size={14} />
          <Text size="xs">{node.label}</Text>
        </div>
        {hasChildren && isOpen && node.children.map((child) => render(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="browse-directory-filter">
      <Text className="eyebrow" mb="sm">
        DIRECTORY FILTER
      </Text>
      {tree.map((node) => render(node, 0))}
    </aside>
  );
}
