import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const entry = (id: number): Entry => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
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

const browseResult = (overrides: Partial<BrowseResult> = {}): BrowseResult => ({
  files: [entry(1), entry(2)],
  total: 2,
  directoryCounts: [{ path: 'C:/Media/2025', count: 2, hidden: 0 }],
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

  it('requests a page for the selected search-param directories', async () => {
    const { rerender } = renderPage(browseResult(), []);
    rerender(pageElement(browseResult(), ['C:/Media']));
    await waitFor(() =>
      expect(mocks.getBrowseData).toHaveBeenCalledWith({
        data: expect.objectContaining({ selectedDirs: ['C:/Media'], page: 1 }),
      }),
    );
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
