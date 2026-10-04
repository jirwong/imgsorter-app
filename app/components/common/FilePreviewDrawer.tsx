import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FileImage, FolderOpen } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { formatBytes } from '../../lib/format';
import { openEntry, revealEntry } from '../../../server/routes/native';
import { getThumbnails } from '../../../server/routes/thumbnails';
import type { NativeActionFailure } from '../../lib/types';

const FAILURE_MESSAGES: Record<NativeActionFailure, string> = {
  'not-found': 'File not found.',
  missing: 'File not found.',
  unsupported: 'This action is not supported here.',
  error: 'The action failed.',
};

export function FilePreviewDrawer() {
  const { selectedFile, setSelectedFile } = useApp();
  const [busy, setBusy] = useState<'reveal' | 'open' | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    setBusy(null);
  }, [selectedFile]);

  useEffect(() => {
    const id = selectedFile?.id;
    if (!id) {
      setThumb(null);
      return;
    }
    let active = true;
    getThumbnails({ data: { ids: [id] } })
      .then((map) => {
        if (active) setThumb(map[id] ?? null);
      })
      .catch(() => {
        if (active) setThumb(null);
      });
    return () => {
      active = false;
    };
  }, [selectedFile]);

  const run = async (kind: 'reveal' | 'open'): Promise<void> => {
    if (!selectedFile) return;
    setBusy(kind);
    try {
      const result =
        kind === 'reveal'
          ? await revealEntry({ data: { id: selectedFile.id } })
          : await openEntry({ data: { id: selectedFile.id } });
      if (result.ok) {
        notifications.show({
          color: 'cyan',
          message: kind === 'reveal' ? 'File shown in the file manager.' : 'Opened in the default application.',
        });
      } else {
        notifications.show({ color: 'red', message: FAILURE_MESSAGES[result.reason] });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      opened={!!selectedFile}
      onClose={() => setSelectedFile(null)}
      position="right"
      size={360}
      title="File details"
    >
      {selectedFile && (
        <>
          {thumb ? (
            <div className="drawer-thumb" style={{ backgroundImage: `url(${thumb})` }} />
          ) : (
            <div className="drawer-thumb drawer-thumb-empty">
              <FileImage size={40} />
            </div>
          )}
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
            <Button
              leftSection={<FolderOpen size={15} />}
              color="cyan"
              loading={busy === 'reveal'}
              disabled={busy !== null}
              onClick={() => void run('reveal')}
            >
              Reveal
            </Button>
            <Button
              variant="light"
              leftSection={<FileImage size={15} />}
              loading={busy === 'open'}
              disabled={busy !== null}
              onClick={() => void run('open')}
            >
              Open file
            </Button>
          </Group>
        </>
      )}
    </Drawer>
  );
}
