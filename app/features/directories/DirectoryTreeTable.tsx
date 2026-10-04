import { useState, type ReactElement } from 'react';
import { ActionIcon, Button, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronDown, ChevronRight, Copy, FolderOpen, ListFilter } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import { revealFolder } from '../../../server/routes/native';
import type { DirectoryNode, NativeActionFailure } from '../../lib/types';

const FAILURE_MESSAGES: Record<NativeActionFailure, string> = {
  'not-found': 'Folder not found.',
  missing: 'Folder not found.',
  unsupported: 'This action is not supported here.',
  error: 'The action failed.',
};

export function DirectoryTreeTable({ tree }: { tree: DirectoryNode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    const visit = (nodes: DirectoryNode[]): void => {
      for (const node of nodes) {
        initial[node.path] = true;
        visit(node.children);
      }
    };
    visit(tree);
    return initial;
  });

  const reveal = (path: string) => {
    void revealFolder({ data: { path } })
      .then((result) => {
        if (result.ok) notifications.show({ color: 'cyan', message: 'Folder shown in the file manager.' });
        else notifications.show({ color: 'red', message: FAILURE_MESSAGES[result.reason] });
      })
      .catch(() => notifications.show({ color: 'red', message: 'The action failed.' }));
  };

  const filterBrowse = (path: string) => {
    void router.navigate({ to: '/browse', search: { selectedDirs: [path] } as never });
  };

  const copyPath = (path: string) => {
    void navigator.clipboard
      .writeText(path)
      .then(() => notifications.show({ color: 'cyan', message: 'Path copied.' }))
      .catch(() => notifications.show({ color: 'red', message: 'Could not copy the path.' }));
  };

  const rows: ReactElement[] = [];
  const render = (node: DirectoryNode, depth: number): void => {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node.path] ?? false;
    rows.push(
      <Table.Tr key={node.path}>
        <Table.Td>
          <Group gap="xs" style={{ paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
                onClick={() => setOpen((state) => ({ ...state, [node.path]: !isOpen }))}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </ActionIcon>
            ) : (
              <span className="directory-spacer" />
            )}
            <FolderOpen size={15} />
            <Text size="sm">{node.label}</Text>
          </Group>
        </Table.Td>
        <Table.Td>{node.fileCount.toLocaleString('en-US')}</Table.Td>
        <Table.Td>{formatBytes(node.size)}</Table.Td>
        <Table.Td>{node.isRoot && node.lastScannedAt ? formatRelativeTime(node.lastScannedAt) : ''}</Table.Td>
        <Table.Td>
          <Group gap={4} justify="flex-end">
            <Button variant="subtle" size="xs" leftSection={<FolderOpen size={13} />} onClick={() => reveal(node.path)}>
              Reveal
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<ListFilter size={13} />}
              onClick={() => filterBrowse(node.path)}
            >
              Filter
            </Button>
            <Button variant="subtle" size="xs" leftSection={<Copy size={13} />} onClick={() => copyPath(node.path)}>
              Copy path
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>,
    );
    if (hasChildren && isOpen) for (const child of node.children) render(child, depth + 1);
  };
  for (const node of tree) render(node, 0);

  if (tree.length === 0) return <Text c="dimmed">No directories indexed yet.</Text>;

  return (
    <Table className="directories-table">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Folder</Table.Th>
          <Table.Th>Files</Table.Th>
          <Table.Th>Size</Table.Th>
          <Table.Th>Last scan</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
