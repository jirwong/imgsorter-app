import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  hideFile: vi.fn(),
  hideFiles: vi.fn(),
  unhideFile: vi.fn(),
  unhideFiles: vi.fn(),
  clearHidden: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/hidden', () => ({
  hideFile: mocks.hideFile,
  hideFiles: mocks.hideFiles,
  unhideFile: mocks.unhideFile,
  unhideFiles: mocks.unhideFiles,
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
const file3 = 'C:/Media/2024/file-3.jpg';

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
    mocks.hideFiles.mockResolvedValue({ hidden: [] });
    mocks.unhideFile.mockResolvedValue({ hidden: [] });
    mocks.unhideFiles.mockResolvedValue({ hidden: [] });
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
    expect(within(option).getByText('2 files · 0 hidden')).toBeInTheDocument();
  });

  it('shows the hidden count for each directory option', () => {
    renderPage(files, [file1]);
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    const withHidden = within(dialog).getByText('C:/Media/2025').closest('.directory-option') as HTMLElement;
    expect(within(withHidden).getByText('2 files · 1 hidden')).toBeInTheDocument();
    const withoutHidden = within(dialog).getByText('C:/Media/2024').closest('.directory-option') as HTMLElement;
    expect(within(withoutHidden).getByText('1 file · 0 hidden')).toBeInTheDocument();
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

  it('hides the selected files with the bulk action', async () => {
    mocks.hideFiles.mockResolvedValue({ hidden: [file1] });
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select file-1.jpg' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide selected' }));
    await waitFor(() => expect(mocks.hideFiles).toHaveBeenCalledWith({ data: { paths: [file1] } }));
    expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('selects all visible rows with the header checkbox', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide selected' }));
    await waitFor(() => expect(mocks.hideFiles).toHaveBeenCalledWith({ data: { paths: [file1, file2, file3] } }));
  });

  it('toggles select all and deselect all with the button', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.queryByText('3 selected')).not.toBeInTheDocument();
  });

  it('unhides the selected files in the hidden view', async () => {
    renderPage(files, [file1, file2]);
    chooseHiddenFilter('Hidden files');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhide selected' }));
    await waitFor(() => expect(mocks.unhideFiles).toHaveBeenCalledWith({ data: { paths: [file1, file2] } }));
  });

  it('keeps the selection across pages', () => {
    const many = Array.from({ length: 26 }, (_, index) => entry(index + 1, 'C:/Media/2025'));
    renderPage(many);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    expect(screen.getByText('25 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('25 selected')).toBeInTheDocument();
  });

  it('offers 100 rows per page', () => {
    renderPage();
    fireEvent.click(screen.getAllByLabelText('Items per page')[0]);
    expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
  });

  it('does not show the Export button', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('renders the filters and controls in separate rows', () => {
    renderPage();
    const rows = document.querySelector('.files-filter-rows');
    expect(rows?.children).toHaveLength(2);
    expect(rows?.children[0]?.contains(screen.getByPlaceholderText('Filter filename or path'))).toBe(true);
    expect(rows?.children[1]?.contains(screen.getByText('3 files found'))).toBe(true);
  });

  it('sorts by location by default', () => {
    renderPage();
    expect(screen.getAllByText(/^file-\d+\.jpg$/).map((el) => el.textContent)).toEqual([
      'file-3.jpg',
      'file-1.jpg',
      'file-2.jpg',
    ]);
  });

  it('sorts by filename when the header is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('columnheader', { name: /Filename/ }));
    expect(screen.getAllByText(/^file-\d+\.jpg$/).map((el) => el.textContent)).toEqual([
      'file-1.jpg',
      'file-2.jpg',
      'file-3.jpg',
    ]);
    fireEvent.click(screen.getByRole('columnheader', { name: /Filename/ }));
    expect(screen.getAllByText(/^file-\d+\.jpg$/).map((el) => el.textContent)).toEqual([
      'file-3.jpg',
      'file-2.jpg',
      'file-1.jpg',
    ]);
  });
});
