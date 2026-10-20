import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { Entry, FilesResult } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  getFilesPage: vi.fn(),
  hideFile: vi.fn(),
  hideFiles: vi.fn(),
  unhideFile: vi.fn(),
  unhideFiles: vi.fn(),
  clearHidden: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/files', () => ({
  getFilesPage: mocks.getFilesPage,
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

const file1 = 'C:/Media/2025/file-1.jpg';
const file2 = 'C:/Media/2025/file-2.jpg';
const file3 = 'C:/Media/2024/file-3.jpg';

const filesResult = (overrides: Partial<FilesResult> = {}): FilesResult => ({
  files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025'), entry(3, 'C:/Media/2024')],
  total: 3,
  directoryCounts: [
    { path: 'C:/Media/2024', count: 1, hidden: 0 },
    { path: 'C:/Media/2025', count: 2, hidden: 0 },
  ],
  extensionCounts: [{ extension: '.jpg', count: 3 }],
  hiddenCount: 0,
  ...overrides,
});

function pageElement(data: FilesResult, hidden: string[]) {
  return (
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <FilesPage initial={data} hidden={hidden} />
      </AppProvider>
    </MantineProvider>
  );
}

function renderPage(data: FilesResult = filesResult(), hidden: string[] = []) {
  return render(pageElement(data, hidden));
}

function chooseHiddenFilter(name: string) {
  fireEvent.click(screen.getAllByLabelText('Hidden filter')[0]);
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('FilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFilesPage.mockResolvedValue(filesResult());
    mocks.hideFile.mockResolvedValue({ hidden: [] });
    mocks.hideFiles.mockResolvedValue({ hidden: [] });
    mocks.unhideFile.mockResolvedValue({ hidden: [] });
    mocks.unhideFiles.mockResolvedValue({ hidden: [] });
    mocks.clearHidden.mockResolvedValue({ hidden: [] });
  });

  it('renders the rows returned by the server', () => {
    renderPage();
    expect(screen.getByText('file-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(mocks.getFilesPage).not.toHaveBeenCalled();
  });

  it('renders the total from the server, not the row count', () => {
    renderPage(filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 42 }));
    expect(screen.getByText('42 files found')).toBeInTheDocument();
  });

  it('refetches when the loader supplies a new page', async () => {
    const second = filesResult({
      files: [entry(4, 'C:/Media/2026')],
      total: 1,
      directoryCounts: [{ path: 'C:/Media/2026', count: 1, hidden: 0 }],
      extensionCounts: [{ extension: '.jpg', count: 1 }],
    });
    mocks.getFilesPage.mockResolvedValue(second);
    const { rerender } = renderPage();
    rerender(pageElement(second, []));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenCalledWith({ data: expect.objectContaining({ page: 1 }) }),
    );
    expect(await screen.findByText('file-4.jpg')).toBeInTheDocument();
  });

  it('keeps the current page when the loader refreshes', async () => {
    const first = filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 30 });
    const secondPage = filesResult({ files: [entry(26, 'C:/Media/2025')], total: 30, directoryCounts: [] });
    const refreshed = filesResult({ files: [entry(27, 'C:/Media/2025')], total: 30, directoryCounts: [] });
    mocks.getFilesPage.mockResolvedValueOnce(secondPage).mockResolvedValueOnce(refreshed);
    const { rerender } = renderPage(first);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('file-26.jpg');
    rerender(pageElement(refreshed, []));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 2 }) }),
    );
    expect(await screen.findByText('file-27.jpg')).toBeInTheDocument();
  });

  it('adopts a changed hidden list from the loader', () => {
    const data = filesResult();
    const { rerender } = renderPage(data);
    rerender(pageElement(data, [file1]));
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(mocks.getFilesPage).not.toHaveBeenCalled();
  });

  it('renders directory counts from the result', () => {
    renderPage(
      filesResult({
        directoryCounts: [
          { path: 'C:/Media/2024', count: 1, hidden: 0 },
          { path: 'C:/Media/2025', count: 2, hidden: 1 },
        ],
        hiddenCount: 1,
      }),
      [file1],
    );
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    const withHidden = within(dialog).getByText('C:/Media/2025').closest('.directory-option') as HTMLElement;
    expect(within(withHidden).getByText('2 files · 1 hidden')).toBeInTheDocument();
    const withoutHidden = within(dialog).getByText('C:/Media/2024').closest('.directory-option') as HTMLElement;
    expect(within(withoutHidden).getByText('1 file · 0 hidden')).toBeInTheDocument();
  });

  it('requests a new page when Next is clicked', async () => {
    renderPage(filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 30 }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenCalledWith({ data: expect.objectContaining({ page: 2 }) }),
    );
  });

  it('shows a loading state while a page is requested', async () => {
    let resolve: (value: FilesResult) => void = () => {};
    mocks.getFilesPage.mockReturnValue(
      new Promise<FilesResult>((done) => {
        resolve = done;
      }),
    );
    const page = filesResult({ files: [entry(1, 'C:/Media/2025')], total: 30 });
    renderPage(page);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    resolve(page);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('resets to page 1 when a filter changes', async () => {
    renderPage(filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 30 }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 2 }) }),
    );
    fireEvent.change(screen.getByPlaceholderText('Filter filename or path'), { target: { value: 'file' } });
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ page: 1, query: 'file' }),
      }),
    );
  });

  it('requests a directory filter with the directory picker', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'C:/Media/2024' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ selectedDirs: ['C:/Media/2024'], page: 1 }),
      }),
    );
  });

  it('requests the size, extension and hidden filters', async () => {
    renderPage();
    fireEvent.click(screen.getAllByLabelText('Size filter')[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Over 25 MB' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizeFilter: 'over25', page: 1 }),
      }),
    );
    fireEvent.click(screen.getAllByLabelText('Extension filter')[0]);
    fireEvent.click(screen.getByRole('option', { name: '.jpg' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ extensions: ['.jpg'], page: 1 }),
      }),
    );
    chooseHiddenFilter('All files');
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ hiddenMode: 'all', page: 1 }),
      }),
    );
  });

  it('requests a filename sort when the header is clicked', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('columnheader', { name: /Filename/ }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sortKey: 'filename', direction: 'asc', page: 1 }),
      }),
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /Filename/ }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sortKey: 'filename', direction: 'desc', page: 1 }),
      }),
    );
  });

  it('renders the rows in the order the server returns', () => {
    renderPage(
      filesResult({ files: [entry(3, 'C:/Media/2024'), entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')] }),
    );
    expect(screen.getAllByText(/^file-\d+\.jpg$/).map((el) => el.textContent)).toEqual([
      'file-3.jpg',
      'file-1.jpg',
      'file-2.jpg',
    ]);
  });

  it('hides a file and refetches the current page', async () => {
    mocks.hideFile.mockResolvedValue({ hidden: [file1] });
    mocks.getFilesPage.mockResolvedValue(
      filesResult({
        files: [entry(2, 'C:/Media/2025'), entry(3, 'C:/Media/2024')],
        total: 2,
        hiddenCount: 1,
      }),
    );
    renderPage();
    const row = screen.getByText('file-1.jpg').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.hideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
    await waitFor(() => expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument());
    expect(screen.getByText('2 files found')).toBeInTheDocument();
    expect(mocks.getFilesPage).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 1 }) });
  });

  it('clamps to the last page when a refetch shrinks the page count', async () => {
    const many = Array.from({ length: 25 }, (_, index) => entry(index + 1, 'C:/Media/2025'));
    const secondPage = filesResult({ files: [entry(26, 'C:/Media/2025')], total: 26, directoryCounts: [] });
    const shrunk = filesResult({ files: [], total: 25, directoryCounts: [] });
    mocks.getFilesPage.mockResolvedValueOnce(secondPage).mockResolvedValueOnce(shrunk);
    mocks.hideFile.mockResolvedValue({ hidden: ['C:/Media/2025/file-26.jpg'] });
    renderPage(filesResult({ files: many, total: 26 }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const row = (await screen.findByText('file-26.jpg')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 1 }) }),
    );
    expect(mocks.getFilesPage).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(document.querySelector('.analytics-pagination')).toHaveTextContent('Page 1 of 1'));
  });

  it('shows hidden files and restores one', async () => {
    mocks.getFilesPage.mockResolvedValue(filesResult({ files: [entry(1, 'C:/Media/2025')], total: 1, hiddenCount: 1 }));
    renderPage(filesResult({ files: [], total: 0, hiddenCount: 1 }), [file1]);
    expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument();
    chooseHiddenFilter('Hidden files');
    await waitFor(() =>
      expect(mocks.getFilesPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ hiddenMode: 'hidden', page: 1 }),
      }),
    );
    const filename = await screen.findByText('file-1.jpg');
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    const row = filename.closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Unhide' }));
    await waitFor(() => expect(mocks.unhideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
  });

  it('shows the hidden count and restores all', async () => {
    mocks.getFilesPage.mockResolvedValue(
      filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 2, hiddenCount: 2 }),
    );
    renderPage(filesResult({ files: [], total: 0, hiddenCount: 2 }), [file1, file2]);
    expect(screen.getByText('2 hidden')).toBeInTheDocument();
    chooseHiddenFilter('Hidden files');
    await screen.findByText('file-1.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    await waitFor(() => expect(mocks.clearHidden).toHaveBeenCalledTimes(1));
  });

  it('hides the selected files with the bulk action', async () => {
    mocks.hideFiles.mockResolvedValue({ hidden: [file1] });
    mocks.getFilesPage.mockResolvedValue(
      filesResult({
        files: [entry(2, 'C:/Media/2025'), entry(3, 'C:/Media/2024')],
        total: 2,
        hiddenCount: 1,
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select file-1.jpg' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide selected' }));
    await waitFor(() => expect(mocks.hideFiles).toHaveBeenCalledWith({ data: { paths: [file1] } }));
    await waitFor(() => expect(screen.queryByText('file-1.jpg')).not.toBeInTheDocument());
    expect(screen.getByText('2 files found')).toBeInTheDocument();
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
    mocks.getFilesPage.mockResolvedValue(
      filesResult({ files: [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025')], total: 2, hiddenCount: 2 }),
    );
    renderPage(filesResult({ files: [], total: 0, hiddenCount: 2 }), [file1, file2]);
    chooseHiddenFilter('Hidden files');
    await screen.findByText('file-1.jpg');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhide selected' }));
    await waitFor(() => expect(mocks.unhideFiles).toHaveBeenCalledWith({ data: { paths: [file1, file2] } }));
  });

  it('keeps the selection across pages', async () => {
    const many = Array.from({ length: 25 }, (_, index) => entry(index + 1, 'C:/Media/2025'));
    mocks.getFilesPage.mockResolvedValue(
      filesResult({ files: [entry(26, 'C:/Media/2025')], total: 26, directoryCounts: [] }),
    );
    renderPage(filesResult({ files: many, total: 26 }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    expect(screen.getByText('25 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('file-26.jpg');
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
});
