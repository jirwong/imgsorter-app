import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider, useApp } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  revealEntry: vi.fn(),
  openEntry: vi.fn(),
  getThumbnails: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/native', () => ({
  revealEntry: mocks.revealEntry,
  openEntry: mocks.openEntry,
}));

vi.mock('../../../server/routes/thumbnails', () => ({
  getThumbnails: mocks.getThumbnails,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { FilePreviewDrawer } from './FilePreviewDrawer';

const selected: Entry = {
  id: 7,
  size: 2048,
  directory: 'C:/Media/2025',
  extension: 'jpg',
  filename: 'a.jpg',
  birthtime: '2025-01-01T00:00:00Z',
  hash: 'abc',
  path: 'C:/Media/2025/a.jpg',
};

function Harness() {
  const { setSelectedFile } = useApp();
  useEffect(() => {
    setSelectedFile(selected);
  }, [setSelectedFile]);
  return <FilePreviewDrawer />;
}

function renderDrawer() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <Harness />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('FilePreviewDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getThumbnails.mockResolvedValue({});
  });

  it('renders nothing while closed', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilePreviewDrawer />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.queryByText('File details')).not.toBeInTheDocument();
  });

  it('reveals the selected file and shows a success toast', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(mocks.revealEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });

  it('shows an error toast when reveal fails', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: false, reason: 'missing' });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() =>
      expect(mocks.notifyShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red', message: 'File not found.' }),
      ),
    );
  });

  it('opens the selected file', async () => {
    mocks.openEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await waitFor(() => expect(mocks.openEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });

  it('renders the fetched preview', async () => {
    mocks.getThumbnails.mockResolvedValue({ 7: 'data:image/webp;base64,AAAA' });
    renderDrawer();
    await waitFor(() => expect(mocks.getThumbnails).toHaveBeenCalledWith({ data: { ids: [7] } }));
    await waitFor(() => expect(document.querySelector('.drawer-thumb-empty')).not.toBeInTheDocument());
  });

  it('shows the placeholder when there is no preview', async () => {
    renderDrawer();
    await waitFor(() => expect(document.querySelector('.drawer-thumb-empty')).toBeInTheDocument());
  });
});
