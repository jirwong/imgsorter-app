import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  hideFile: vi.fn(),
  unhideFile: vi.fn(),
  clearHidden: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/hidden', () => ({
  hideFile: mocks.hideFile,
  unhideFile: mocks.unhideFile,
  clearHidden: mocks.clearHidden,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { FilesPage } from './FilesPage';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `${directory}/file-${id}.jpg`,
});

const files: Entry[] = [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025'), entry(3, 'C:/Media/2024')];
const file1 = 'C:/Media/2025/file-1.jpg';
const file2 = 'C:/Media/2025/file-2.jpg';

function renderPage(data: Entry[] = files, hidden: string[] = []) {
  render(
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <FilesPage files={data} hidden={hidden} />
      </AppProvider>
    </MantineProvider>,
  );
}

function chooseHiddenFilter(name: string) {
  fireEvent.click(screen.getAllByLabelText('Hidden filter')[0]);
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('FilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hideFile.mockResolvedValue({ hidden: [] });
    mocks.unhideFile.mockResolvedValue({ hidden: [] });
    mocks.clearHidden.mockResolvedValue({ hidden: [] });
  });

  it('renders rows from the provided files', () => {
    renderPage();
    expect(screen.getByText('3 files found')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('filters files by directory with the directory picker', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'C:/Media/2024' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('1 files found')).toBeInTheDocument();
  });

  it('shows the file count for each directory option', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    const option = within(dialog).getByText('C:/Media/2025').closest('.directory-option') as HTMLElement;
    expect(within(option).getByText('2')).toBeInTheDocument();
  });

  it('hides a file and removes it from the active list', async () => {
    mocks.hideFile.mockResolvedValue({ hidden: [file1] });
    renderPage();
    const row = screen.getByText('file-1.jpg').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.hideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
    expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('2 files found')).toBeInTheDocument();
  });

  it('shows hidden files and restores one', async () => {
    renderPage(files, [file1]);
    expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument();
    chooseHiddenFilter('Hidden files');
    expect(screen.getByText('file-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    const row = screen.getByText('file-1.jpg').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Unhide' }));
    await waitFor(() => expect(mocks.unhideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
  });

  it('shows the hidden count and restores all', async () => {
    renderPage(files, [file1, file2]);
    expect(screen.getByText('2 hidden')).toBeInTheDocument();
    chooseHiddenFilter('Hidden files');
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    await waitFor(() => expect(mocks.clearHidden).toHaveBeenCalledTimes(1));
  });
});
