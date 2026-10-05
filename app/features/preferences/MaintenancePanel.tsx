import { useState } from 'react';
import { Button, Card, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CircleAlert } from 'lucide-react';
import { useLoaderData, useRouter } from '@tanstack/react-router';
import { formatBytes } from '../../lib/format';
import { useScanStatus } from '../../lib/scan-store';
import { resetLibraryIndex } from '../../../server/routes/maintenance';

export function MaintenancePanel() {
  const router = useRouter();
  const { files, size } = useLoaderData({ from: '__root__' });
  const scan = useScanStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const running = scan.status === 'running';

  const reset = () => {
    setBusy(true);
    void resetLibraryIndex()
      .then((result) => {
        setConfirmOpen(false);
        notifications.show({ color: 'cyan', message: `Library index reset (${result.entries} files removed).` });
        return router.invalidate();
      })
      .catch(() => notifications.show({ color: 'red', message: 'Could not reset the library index.' }))
      .finally(() => setBusy(false));
  };

  return (
    <Card className="indexing-settings-card application-panel">
      <Text className="eyebrow">MAINTENANCE</Text>
      <h3>Library index</h3>
      <Text size="sm" c="dimmed">
        Reset removes every scanned file record. Your directories and preferences stay.
      </Text>
      <Text size="sm" mt="md">
        {files.toLocaleString('en-US')} files · {formatBytes(size)} indexed
      </Text>
      <Text size="xs" c="orange" mt="md">
        <CircleAlert size={13} /> This action is permanent. There is no undo.
      </Text>
      <Group justify="flex-end" mt="md">
        <Button color="red" disabled={busy || running} onClick={() => setConfirmOpen(true)}>
          Reset library index
        </Button>
      </Group>
      {running && (
        <Text size="xs" c="dimmed" mt="xs">
          A scan is running. Wait for it to finish before you reset.
        </Text>
      )}
      <Modal opened={confirmOpen} onClose={() => setConfirmOpen(false)} title="Reset library index?">
        <Text size="sm">
          This clears the indexed files, the duplicate records, the keepers, the preview cache, and the scan history.
          Your configured directories and preferences stay.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={reset}>
            Reset
          </Button>
        </Group>
      </Modal>
    </Card>
  );
}
