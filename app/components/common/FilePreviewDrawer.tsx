import { Button, Drawer, Group, Table, Text } from '@mantine/core';
import { FileImage, FolderOpen } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { thumbs } from '../../lib/mock-data';
import { formatBytes } from '../../lib/format';

export function FilePreviewDrawer() {
  const { selectedFile, setSelectedFile } = useApp();

  return (
    <Drawer opened={!!selectedFile} onClose={() => setSelectedFile(null)} position="right" title="File details">
      {selectedFile && (
        <>
          <div
            className="drawer-thumb"
            style={{ backgroundImage: `url(${thumbs[(selectedFile.id || 1) % thumbs.length]})` }}
          />
          <Text className="eyebrow" mt="lg">
            PATH
          </Text>
          <Text size="sm" className="path">
            {selectedFile.path}
          </Text>
          <Table mt="lg">
            <Table.Tbody>
              {(
                [
                  ['Size', formatBytes(selectedFile.size)],
                  ['Extension', selectedFile.extension],
                  ['Created', selectedFile.birthtime],
                  ['Hash', selectedFile.hash || 'NULL — unverified'],
                ] as const
              ).map(([label, value]) => (
                <Table.Tr key={label}>
                  <Table.Td c="dimmed">{label}</Table.Td>
                  <Table.Td>{value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group mt="xl">
            <Button leftSection={<FolderOpen size={15} />} color="cyan">
              Reveal
            </Button>
            <Button variant="light" leftSection={<FileImage size={15} />}>
              Open file
            </Button>
          </Group>
        </>
      )}
    </Drawer>
  );
}
