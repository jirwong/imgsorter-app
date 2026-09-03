import { useState, type ReactElement } from 'react';
import { Button, Checkbox, Group, Text } from '@mantine/core';
import { ChevronDown, ChevronRight, ChevronsUpDown, FolderOpen } from 'lucide-react';
import { directoryTree } from '../../lib/mock-data';
import type { DirectoryNode } from '../../lib/types';
import { useApp } from '../../lib/app-context';

export function DirectoryTree() {
  const { selectedDirs, toggleSelectedDir } = useApp();
  const [nodeOpen, setNodeOpen] = useState<Record<string, boolean>>({ 'C:/Media': true, 'C:/Media/2025': true });

  const render = (node: DirectoryNode, depth: number): ReactElement => (
    <div key={node.path}>
      <div className="directory-node" style={{ paddingLeft: depth * 14 }}>
        <button
          className="directory-expand"
          aria-label={`${nodeOpen[node.path] ? 'Collapse' : 'Expand'} ${node.label}`}
          onClick={() => node.children && setNodeOpen((state) => ({ ...state, [node.path]: !state[node.path] }))}
        >
          {node.children ? (
            nodeOpen[node.path] ? (
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
      {node.children && nodeOpen[node.path] && node.children.map((child) => render(child, depth + 1))}
    </div>
  );

  return (
    <aside className="browse-directory-filter">
      <Group justify="space-between" mb="sm">
        <Text className="eyebrow">DIRECTORY FILTER</Text>
        <Button variant="subtle" size="xs" aria-label="Collapse directory filter">
          <ChevronsUpDown size={14} />
        </Button>
      </Group>
      {directoryTree.map((node) => render(node, 0))}
    </aside>
  );
}
