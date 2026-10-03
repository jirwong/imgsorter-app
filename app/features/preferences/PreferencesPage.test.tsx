import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DEFAULT_APP_CONFIG } from '../../lib/app-config-defaults';

const mocks = vi.hoisted(() => ({
  saveDirectories: vi.fn(),
  saveApplicationSettings: vi.fn(),
}));

vi.mock('../../../server/routes/preferences', () => ({
  saveDirectories: mocks.saveDirectories,
  saveApplicationSettings: mocks.saveApplicationSettings,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ invalidate: vi.fn(async () => {}) }) };
});

import { PreferencesPage } from './PreferencesPage';

const config = {
  ...DEFAULT_APP_CONFIG,
  directories: { indexed: [{ path: 'C:/Media/2025', enabled: true }], ignored: [] },
};

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <PreferencesPage config={config} />
    </MantineProvider>,
  );
}

describe('PreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
