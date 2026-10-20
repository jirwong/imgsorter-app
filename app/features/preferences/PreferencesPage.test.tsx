import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DEFAULT_APP_CONFIG } from '../../lib/app-config-defaults';

const mocks = vi.hoisted(() => ({
  saveDirectories: vi.fn(),
  saveApplicationSettings: vi.fn(),
  pickDirectory: vi.fn(),
  clearThumbnailCache: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/preferences', () => ({
  saveDirectories: mocks.saveDirectories,
  saveApplicationSettings: mocks.saveApplicationSettings,
}));

vi.mock('../../../server/routes/native', () => ({
  pickDirectory: mocks.pickDirectory,
}));

vi.mock('../../../server/routes/thumbnails', () => ({
  clearThumbnailCache: mocks.clearThumbnailCache,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ invalidate: vi.fn(async () => {}) }),
    useLoaderData: () => ({ files: 0, size: 0 }),
  };
});

import { PreferencesPage } from './PreferencesPage';

const config = {
  ...DEFAULT_APP_CONFIG,
  directories: {
    indexed: [
      { path: 'C:/Media/2025', enabled: true },
      { path: 'D:/Camera Imports', enabled: true },
    ],
    ignored: [],
  },
  directoryMeta: { 'c:/media/2025': { lastScannedAt: '2026-10-03T12:00:00.000Z' } },
};

const counts = { 'C:/Media/2025': 42, 'D:/Camera Imports': 0 };

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderPage(pageConfig = config, pageCounts = counts) {
  render(
    <MantineProvider defaultColorScheme="dark">
      <PreferencesPage config={pageConfig} counts={pageCounts} />
    </MantineProvider>,
  );
}

describe('PreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearThumbnailCache.mockResolvedValue({ removed: 2 });
  });

  it('renders the application tab with a disabled database name', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Application configuration' })).toBeInTheDocument();
    expect(screen.getByLabelText('Local database name')).toBeDisabled();
  });

  it('shows configured directories on the directories tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    expect(screen.getByText('Directories included in scans')).toBeInTheDocument();
    expect(screen.getByText('C:/Media/2025')).toBeInTheDocument();
    expect(screen.getByText(/42 files/)).toBeInTheDocument();
    expect(screen.getByText(/Last scan/)).toBeInTheDocument();
    expect(screen.getByText(/Not scanned yet/)).toBeInTheDocument();
  });

  it('shows the Maintenance tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }));
    expect(screen.getByText('Library index')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset library index' })).toBeInTheDocument();
  });

  it('disables the checkbox and remove button while the save is in flight', async () => {
    const pending = deferred();
    mocks.saveDirectories.mockReturnValue(pending.promise);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    const checkbox = screen.getByLabelText('Enable C:/Media/2025');
    const row = checkbox.closest('.preference-row') as HTMLElement;
    const other = screen.getByLabelText('Enable D:/Camera Imports');
    const otherRow = other.closest('.preference-row') as HTMLElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(other).toBeDisabled();
    expect(within(otherRow).getByRole('button', { name: 'Remove' })).toBeDisabled();
    pending.resolve({
      directories: {
        indexed: [
          { path: 'C:/Media/2025', enabled: false },
          { path: 'D:/Camera Imports', enabled: true },
        ],
        ignored: [],
      },
      application: DEFAULT_APP_CONFIG.application,
    });
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeEnabled();
    expect(other).toBeEnabled();
    expect(within(otherRow).getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('blocks a second toggle while a save is in flight', async () => {
    const pending = deferred();
    mocks.saveDirectories.mockReturnValue(pending.promise);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    const first = screen.getByLabelText('Enable C:/Media/2025');
    const second = screen.getByLabelText('Enable D:/Camera Imports');
    fireEvent.click(first);
    await waitFor(() => expect(second).toBeDisabled());
    fireEvent.click(second);
    expect(mocks.saveDirectories).toHaveBeenCalledTimes(1);
    pending.resolve({
      directories: {
        indexed: [
          { path: 'C:/Media/2025', enabled: false },
          { path: 'D:/Camera Imports', enabled: true },
        ],
        ignored: [],
      },
      application: DEFAULT_APP_CONFIG.application,
    });
    await waitFor(() => expect(second).toBeEnabled());
    expect(mocks.saveDirectories).toHaveBeenCalledTimes(1);
  });

  it('reconciles the toggle from the server response', async () => {
    mocks.saveDirectories.mockResolvedValue({
      directories: {
        indexed: [
          { path: 'C:/Media/2025', enabled: true },
          { path: 'D:/Camera Imports', enabled: true },
        ],
        ignored: [],
      },
      application: DEFAULT_APP_CONFIG.application,
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    const checkbox = screen.getByLabelText('Enable C:/Media/2025');
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).toBeChecked();
    expect(mocks.saveDirectories).toHaveBeenCalledTimes(1);
    expect(mocks.saveDirectories.mock.calls[0][0]).toEqual({
      data: {
        indexed: [
          { path: 'C:/Media/2025', enabled: false },
          { path: 'D:/Camera Imports', enabled: true },
        ],
        ignored: [],
      },
    });
  });

  it('shows the indexed count for a disabled directory', () => {
    renderPage(
      {
        ...config,
        directories: {
          indexed: [
            { path: 'C:/Media/2025', enabled: true },
            { path: 'D:/Camera Imports', enabled: false },
          ],
          ignored: [],
        },
      },
      { 'C:/Media/2025': 42, 'D:/Camera Imports': 9 },
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    expect(screen.getByText(/42 files/)).toBeInTheDocument();
    expect(screen.getByText(/9 files/)).toBeInTheDocument();
    expect(screen.getByLabelText('Enable D:/Camera Imports')).not.toBeChecked();
  });

  it('rolls back the toggle when the save fails', async () => {
    mocks.saveDirectories.mockRejectedValue(new Error('save failed'));
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    const checkbox = screen.getByLabelText('Enable C:/Media/2025');
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(checkbox).toBeEnabled();
  });

  it('saves a new indexed directory', async () => {
    mocks.saveDirectories.mockResolvedValue({
      directories: {
        indexed: [{ path: 'C:/Media/New', enabled: true }],
        ignored: DEFAULT_APP_CONFIG.directories.ignored,
      },
      application: DEFAULT_APP_CONFIG.application,
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.change(screen.getByLabelText('Add indexed directory'), { target: { value: 'C:/Media/New' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add directory' })[0]);
    await waitFor(() => expect(mocks.saveDirectories).toHaveBeenCalledTimes(1));
    expect(mocks.saveDirectories.mock.calls[0][0].data.indexed).toContainEqual({ path: 'C:/Media/New', enabled: true });
  });

  it('saves application settings', async () => {
    mocks.saveApplicationSettings.mockResolvedValue({
      directories: DEFAULT_APP_CONFIG.directories,
      application: { ...DEFAULT_APP_CONFIG.application, extensions: 'png' },
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('File extensions'), { target: { value: 'png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(mocks.saveApplicationSettings).toHaveBeenCalledTimes(1));
    expect(mocks.saveApplicationSettings.mock.calls[0][0].data.extensions).toBe('png');
  });

  it('fills the indexed input with the picked folder', async () => {
    mocks.pickDirectory.mockResolvedValue({ status: 'picked', path: 'C:/Media/Picked' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse for indexed directory' }));
    await waitFor(() => expect(screen.getByLabelText('Add indexed directory')).toHaveValue('C:/Media/Picked'));
  });

  it('does not change the input when the picker is canceled', async () => {
    mocks.pickDirectory.mockResolvedValue({ status: 'canceled' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse for indexed directory' }));
    await waitFor(() => expect(mocks.pickDirectory).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Add indexed directory')).toHaveValue('');
    expect(mocks.notifyShow).not.toHaveBeenCalled();
  });

  it('fills the ignored input with the picked folder', async () => {
    mocks.pickDirectory.mockResolvedValue({ status: 'picked', path: 'C:/Media/Cache' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse for ignored directory' }));
    await waitFor(() => expect(screen.getByLabelText('Add globally ignored directory')).toHaveValue('C:/Media/Cache'));
  });

  it('saves the preview setting with the application form', async () => {
    mocks.saveApplicationSettings.mockResolvedValue({
      directories: DEFAULT_APP_CONFIG.directories,
      application: { ...DEFAULT_APP_CONFIG.application, generatePreviews: true },
    });
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'Generate thumbnail previews' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(mocks.saveApplicationSettings).toHaveBeenCalledTimes(1));
    expect(mocks.saveApplicationSettings.mock.calls[0][0].data.generatePreviews).toBe(true);
  });

  it('clears the preview cache', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Clear preview cache' }));
    await waitFor(() => expect(mocks.clearThumbnailCache).toHaveBeenCalledTimes(1));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });
});
