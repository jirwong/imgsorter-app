import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ScanState } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  resetLibraryIndex: vi.fn(),
  invalidate: vi.fn(async () => {}),
  notifyShow: vi.fn(),
  scan: { status: 'idle' } as { status: string },
  shell: { files: 1272, size: 391_000_000 },
}));

vi.mock('../../../server/routes/maintenance', () => ({ resetLibraryIndex: mocks.resetLibraryIndex }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notifyShow } }));
vi.mock('../../lib/scan-store', () => ({ useScanStatus: () => mocks.scan as unknown as ScanState }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ invalidate: mocks.invalidate }), useLoaderData: () => mocks.shell };
});

import { MaintenancePanel } from './MaintenancePanel';

function renderPanel() {
  return render(
    <MantineProvider defaultColorScheme="dark" env="test">
      <MaintenancePanel />
    </MantineProvider>,
  );
}

describe('MaintenancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.status = 'idle';
    mocks.resetLibraryIndex.mockResolvedValue({ entries: 1272, records: 24, thumbnails: 3 });
  });

  it('shows the indexed totals and a warning', () => {
    renderPanel();
    expect(screen.getByText('1,272 files · 391.0 MB indexed')).toBeInTheDocument();
    expect(screen.getByText(/This action is permanent/)).toBeInTheDocument();
  });

  it('opens the confirmation modal and resets on confirm', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset library index' }));
    expect(screen.getByText('Reset library index?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(mocks.resetLibraryIndex).toHaveBeenCalledTimes(1));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it('disables reset while a scan is running', () => {
    mocks.scan.status = 'running';
    renderPanel();
    expect(screen.getByRole('button', { name: 'Reset library index' })).toBeDisabled();
  });

  it('shows an error toast when the reset fails', async () => {
    mocks.resetLibraryIndex.mockRejectedValue(new Error('nope'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset library index' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
  });

  it('disables the modal confirm while a scan is running', () => {
    const { rerender } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset library index' }));
    mocks.scan.status = 'running';
    rerender(
      <MantineProvider defaultColorScheme="dark" env="test">
        <MaintenancePanel />
      </MantineProvider>,
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });
});
