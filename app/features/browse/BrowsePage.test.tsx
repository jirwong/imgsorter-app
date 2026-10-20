import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { DirectoryNode, Entry, FilesResult } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  getBrowseData: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/browse', () => ({
  getBrowseData: mocks.getBrowseData,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { BrowsePage } from './BrowsePage';

type BrowseResult = FilesResult & { tree: DirectoryNode[] };

const entry = (id: number, directory = 'C:/Media/2025'): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `${directory}/file-${id}.jpg`,
});

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 2,
    size: 12_800,
    children: [{ label: 'Media', path: 'C:/Media', fileCount: 2, size: 12_800, children: [] }],
  },
];

const otherTree: DirectoryNode[] = [{ label: 'D:\\', path: 'D:', fileCount: 0, size: 0, children: [] }];

const directoryCounts = [
  { path: 'C:/Media/2024', count: 1, hidden: 0 },
  { path: 'C:/Media/2025', count: 2, hidden: 0 },
];

const browseResult = (overrides: Partial<BrowseResult> = {}): BrowseResult => ({
  files: [entry(1), entry(2)],
  total: 2,
  directoryCounts,
  extensionCounts: [{ extension: '.jpg', count: 2 }],
  hiddenCount: 0,
  tree,
  ...overrides,
});

function pageElement(initial: BrowseResult = browseResult(), selectedDirs: string[] = []) {
  return (
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <BrowsePage initial={initial} selectedDirs={selectedDirs} />
      </AppProvider>
    </MantineProvider>
  );
}

function renderPage(initial: BrowseResult = browseResult(), selectedDirs: string[] = []) {
  return render(pageElement(initial, selectedDirs));
}

function applyPickerDirectories(dirs: string[], clear = false) {
  fireEvent.click(screen.getByRole('button', { name: /^(All directories|\d+ directories)$/ }));
  const dialog = screen.getByRole('dialog');
  if (clear) fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));
  for (const dir of dirs) fireEvent.click(within(dialog).getByRole('checkbox', { name: dir }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
}

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBrowseData.mockResolvedValue(browseResult());
  });

  it('renders the loader page and the directory tree', () => {
    renderPage();
    expect(screen.getByText('DIRECTORY FILTER')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('file-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 files found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('does not fetch the first page on mount', () => {
    renderPage(browseResult(), ['C:/Media']);
    expect(mocks.getBrowseData).not.toHaveBeenCalled();
  });

  it('requests a filtered page when a filter changes', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Filter filename or path'), { target: { value: 'file' } });
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenCalledWith({
        data: expect.objectContaining({ query: 'file', page: 1 }),
      }),
    );
  });

  it('sends the tree and picker directories as separate filters', async () => {
    const { rerender } = renderPage(browseResult(), ['C:/Media']);
    applyPickerDirectories(['C:/Media/2025']);
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          selectedDirs: ['C:/Media/2025'],
          lockedDirs: ['C:/Media'],
          page: 1,
        }),
      }),
    );

    mocks.getBrowseData.mockClear();
    rerender(pageElement(browseResult(), ['C:/Media/2024']));
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          selectedDirs: ['C:/Media/2025'],
          lockedDirs: ['C:/Media/2024'],
          page: 1,
        }),
      }),
    );

    applyPickerDirectories([], true);
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ selectedDirs: [], lockedDirs: ['C:/Media/2024'], page: 1 }),
      }),
    );
  });

  it('requests all files so hidden files stay visible', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Filter filename or path'), { target: { value: 'file' } });
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ hiddenMode: 'all', page: 1 }),
      }),
    );
  });

  it('resets the table to page 1 when the tree changes', async () => {
    mocks.getBrowseData.mockResolvedValueOnce(browseResult({ files: [entry(26)], total: 30 }));
    const { rerender } = renderPage(browseResult({ total: 30 }), []);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 2 }) }),
    );
    await screen.findByText('file-26.jpg');

    mocks.getBrowseData.mockClear();
    rerender(pageElement(browseResult({ files: [entry(31)], total: 30 }), ['C:/Media']));
    await waitFor(() => expect(document.querySelector('.analytics-pagination')).toHaveTextContent('Page 1 of 2'));
    expect(screen.getByText('file-31.jpg')).toBeInTheDocument();
    expect(mocks.getBrowseData).not.toHaveBeenCalled();
  });

  it('does not refetch when the loader page matches the query', () => {
    const { rerender } = renderPage(browseResult(), []);
    rerender(pageElement(browseResult({ files: [entry(4)] }), ['C:/Media']));
    expect(screen.getByText('file-4.jpg')).toBeInTheDocument();
    expect(mocks.getBrowseData).not.toHaveBeenCalled();
  });

  it('refetches once when picker directories narrow the loader page', async () => {
    const { rerender } = renderPage(browseResult(), []);
    applyPickerDirectories(['C:/Media/2025']);
    await waitFor(() => expect(mocks.getBrowseData).toHaveBeenCalledTimes(1));

    mocks.getBrowseData.mockClear();
    rerender(pageElement(browseResult(), ['C:/Media/2024']));
    await waitFor(() => expect(mocks.getBrowseData).toHaveBeenCalledTimes(1));
    expect(mocks.getBrowseData).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        selectedDirs: ['C:/Media/2025'],
        lockedDirs: ['C:/Media/2024'],
        page: 1,
      }),
    });
  });

  it('renders the tree returned with a page', async () => {
    mocks.getBrowseData.mockResolvedValue(browseResult({ tree: otherTree }));
    renderPage();
    expect(screen.getByText('Media')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Filter filename or path'), { target: { value: 'file' } });
    expect(await screen.findByText('D:\\')).toBeInTheDocument();
    expect(screen.queryByText('Media')).not.toBeInTheDocument();
  });

  it('keeps the filters and the count on one row', () => {
    renderPage();
    expect(document.querySelector('.files-filter-rows')).toBeNull();
  });
});
