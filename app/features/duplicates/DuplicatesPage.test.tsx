import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { DuplicateGroup, DuplicatesResult, Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  getDuplicatesData: vi.fn(),
  saveKeepers: vi.fn(),
  clearStaleKeepers: vi.fn(),
  hideFile: vi.fn(),
  hideFiles: vi.fn(),
  unhideFile: vi.fn(),
  unhideFiles: vi.fn(),
  clearHidden: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/duplicates', () => ({
  getDuplicatesData: mocks.getDuplicatesData,
  saveKeepers: mocks.saveKeepers,
  clearStaleKeepers: mocks.clearStaleKeepers,
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

import { DuplicatesPage } from './DuplicatesPage';

const entry = (id: number, directory: string, filename = 'dup.jpg', hash = 'h1'): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename,
  birthtime: '2025-02-11T10:24:00Z',
  hash,
  path: `${directory}/${filename}`,
});

const makeGroup = (key: string, name: string, hash: string, files: Entry[]): DuplicateGroup => ({
  key,
  hash,
  name,
  count: files.length,
  size: files[0].size,
  redundantSpace: (files.length - 1) * files[0].size,
  extension: files[0].extension,
  directories: [...new Set(files.map((file) => file.directory))],
  files,
});

const tripsFile = entry(1, 'C:/Media/2025/Trips');
const libraryFile = entry(2, 'C:/Media/2025/Library');
const file1 = tripsFile.path;

const baseGroup = makeGroup('h1:dup.jpg', 'dup.jpg', 'h1', [tripsFile, libraryFile]);

const pageData = (overrides: Partial<DuplicatesResult> = {}): DuplicatesResult => ({
  groups: [baseGroup],
  totalGroups: 1,
  totalFiles: 2,
  keepers: {},
  staleKeepers: 0,
  directoryCounts: [
    { path: 'C:/Media/2025/Library', count: 1, hidden: 0, unit: 'group' },
    { path: 'C:/Media/2025/Trips', count: 1, hidden: 0, unit: 'group' },
  ],
  hiddenCount: 0,
  ...overrides,
});

function pageElement(initial: DuplicatesResult, hidden: string[]) {
  return (
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <DuplicatesPage initial={initial} hidden={hidden} />
      </AppProvider>
    </MantineProvider>
  );
}

function renderPage(initial: DuplicatesResult = pageData(), hidden: string[] = []) {
  return render(pageElement(initial, hidden));
}

function expandGroup() {
  fireEvent.click(screen.getByText('dup.jpg'));
}

function shownDirs() {
  return screen.getAllByText(/^C:\/Media\/2025\/(Trips|Library)$/).map((el) => el.textContent);
}

function chooseFilter(label: string, name: string) {
  fireEvent.click(screen.getAllByLabelText(label)[0]);
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('DuplicatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDuplicatesData.mockResolvedValue(pageData());
    mocks.saveKeepers.mockResolvedValue({ saved: 1 });
    mocks.clearStaleKeepers.mockResolvedValue({ staleKeepers: 0 });
    mocks.hideFile.mockResolvedValue({ hidden: [] });
    mocks.hideFiles.mockResolvedValue({ hidden: [] });
    mocks.unhideFile.mockResolvedValue({ hidden: [] });
    mocks.unhideFiles.mockResolvedValue({ hidden: [] });
    mocks.clearHidden.mockResolvedValue({ hidden: [] });
  });

  it('renders the page from the loader without refetching', () => {
    renderPage();
    expect(screen.getByText('dup.jpg')).toBeInTheDocument();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
    expect(mocks.getDuplicatesData).not.toHaveBeenCalled();
  });

  it('renders the server totals, not the row count', () => {
    renderPage(pageData({ totalGroups: 42, totalFiles: 99 }));
    expect(screen.getByText('42 groups · 99 files · 0 keepers')).toBeInTheDocument();
  });

  it('allows at most one keeper per group and saves on toggle', async () => {
    renderPage();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dup.jpg'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();
    await waitFor(() => expect(mocks.saveKeepers).toHaveBeenCalledTimes(1));
    expect(mocks.saveKeepers.mock.calls[0][0].data.keepers['h1:dup.jpg']).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Keeper' }));
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
  });

  it('starts from supplied keepers', () => {
    renderPage(pageData({ keepers: { 'h1:dup.jpg': 2 } }));
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();
    fireEvent.click(screen.getByText('dup.jpg'));
    const libraryRow = screen.getByText('C:/Media/2025/Library').closest('tr') as HTMLElement;
    expect(within(libraryRow).getByRole('button', { name: 'Keeper' })).toBeInTheDocument();
  });

  it('shows an error toast when the save fails', async () => {
    mocks.saveKeepers.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getByText('dup.jpg'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
  });

  it('shows the stale warning and clears it', async () => {
    renderPage(pageData({ staleKeepers: 2 }));
    expect(screen.getByText('2 saved keepers no longer match a group.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved keepers' }));
    await waitFor(() => expect(mocks.clearStaleKeepers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('2 saved keepers no longer match a group.')).not.toBeInTheDocument());
  });

  it('requests the hidden filter and renders the returned page', async () => {
    const hiddenOnly = pageData({
      groups: [makeGroup('h1:dup.jpg', 'dup.jpg', 'h1', [tripsFile])],
      totalFiles: 1,
      hiddenCount: 1,
    });
    mocks.getDuplicatesData.mockResolvedValue(hiddenOnly);
    renderPage(pageData({ hiddenCount: 1 }), [file1]);
    chooseFilter('Hidden filter', 'Hidden files');
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ hiddenMode: 'hidden', page: 1 }),
      }),
    );
    expandGroup();
    expect(shownDirs()).toEqual(['C:/Media/2025/Trips']);
  });

  it('requests the size, count and extension filters', async () => {
    renderPage();
    chooseFilter('Count filter', '3+ files');
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ countFilter: '3+', page: 1 }),
      }),
    );
    chooseFilter('Size filter', 'Over 25 MB');
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizeFilter: 'over25', page: 1 }),
      }),
    );
    chooseFilter('Extension filter', '.jpg');
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ extensions: ['.jpg'], page: 1 }),
      }),
    );
  });

  it('requests the keeper filter and renders the returned page', async () => {
    const kept = makeGroup('h2:kept.jpg', 'kept.jpg', 'h2', [
      entry(3, 'C:/Media/2024', 'kept.jpg', 'h2'),
      entry(4, 'C:/Media/2025/Library', 'kept.jpg', 'h2'),
    ]);
    mocks.getDuplicatesData.mockResolvedValue(pageData({ groups: [kept] }));
    renderPage();
    chooseFilter('Keeper filter', 'With keeper');
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ keeperFilter: 'with', page: 1 }),
      }),
    );
    expect(await screen.findByText('kept.jpg')).toBeInTheDocument();
  });

  it('marks a hidden file with a badge', () => {
    renderPage(pageData({ hiddenCount: 1 }), [file1]);
    expandGroup();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('hides a file and refetches the current page', async () => {
    mocks.hideFile.mockResolvedValue({ hidden: [file1] });
    mocks.getDuplicatesData.mockResolvedValue(
      pageData({
        groups: [makeGroup('h1:dup.jpg', 'dup.jpg', 'h1', [libraryFile])],
        totalFiles: 1,
        hiddenCount: 1,
      }),
    );
    renderPage();
    expandGroup();
    const row = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.hideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
    await waitFor(() =>
      expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ page: 1, hiddenMode: 'active' }),
      }),
    );
    await waitFor(() => expect(screen.queryByText('C:/Media/2025/Trips')).not.toBeInTheDocument());
  });

  it('unhides a file and refetches the hidden page', async () => {
    const hiddenPage = pageData({
      groups: [makeGroup('h1:dup.jpg', 'dup.jpg', 'h1', [tripsFile])],
      totalFiles: 1,
      hiddenCount: 1,
    });
    mocks.getDuplicatesData.mockResolvedValue(hiddenPage);
    renderPage(hiddenPage, [file1]);
    chooseFilter('Hidden filter', 'Hidden files');
    await waitFor(() => expect(mocks.getDuplicatesData).toHaveBeenCalledTimes(1));
    expandGroup();
    const row = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Unhide' }));
    await waitFor(() => expect(mocks.unhideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
    await waitFor(() => expect(mocks.getDuplicatesData).toHaveBeenCalledTimes(2));
    expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ hiddenMode: 'hidden', page: 1 }),
    });
  });

  it('shows an error toast when hiding fails', async () => {
    mocks.hideFile.mockRejectedValue(new Error('boom'));
    renderPage();
    expandGroup();
    const row = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
  });

  it('hides the selected files with the bulk action', async () => {
    mocks.hideFiles.mockResolvedValue({ hidden: [file1] });
    mocks.getDuplicatesData.mockResolvedValue(
      pageData({
        groups: [makeGroup('h1:dup.jpg', 'dup.jpg', 'h1', [libraryFile])],
        totalFiles: 1,
        hiddenCount: 1,
      }),
    );
    renderPage();
    expandGroup();
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${file1}` }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide selected' }));
    await waitFor(() => expect(mocks.hideFiles).toHaveBeenCalledWith({ data: { paths: [file1] } }));
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('selects all visible files with the header checkbox', () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible files' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('selects a whole group with the group checkbox', () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select group dup.jpg' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('drops a file from the selection after the row hide', async () => {
    mocks.hideFile.mockResolvedValue({ hidden: [file1] });
    renderPage();
    expandGroup();
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${file1}` }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    const row = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.hideFile).toHaveBeenCalled());
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('keeps the selection across pages', async () => {
    const secondGroup = makeGroup('h2:dup2.jpg', 'dup2.jpg', 'h2', [
      entry(3, 'C:/Media/2024', 'dup2.jpg', 'h2'),
      entry(4, 'C:/Media/2025/Library', 'dup2.jpg', 'h2'),
    ]);
    mocks.getDuplicatesData.mockResolvedValue(
      pageData({ groups: [secondGroup], totalGroups: 30, totalFiles: 60, directoryCounts: [] }),
    );
    renderPage(pageData({ totalGroups: 30, totalFiles: 60 }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select group dup.jpg' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('dup2.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(mocks.getDuplicatesData).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 2 }) });
  });

  it('shows the hidden count', () => {
    renderPage(pageData({ hiddenCount: 1 }), [file1]);
    expect(screen.getByText('1 hidden')).toBeInTheDocument();
  });

  it('shows the group and hidden counts in the directory picker', () => {
    renderPage(
      pageData({
        directoryCounts: [{ path: 'C:/Media/2025/Trips', count: 1, hidden: 1, unit: 'group' }],
        hiddenCount: 1,
      }),
      [file1],
    );
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    const option = within(dialog).getByText('C:/Media/2025/Trips').closest('.directory-option') as HTMLElement;
    expect(within(option).getByText('1 group · 1 hidden')).toBeInTheDocument();
  });

  it('left aligns the control section', () => {
    renderPage();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).not.toHaveClass('filter-count');
  });
});
