import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { DuplicateGroup, Entry, KeeperMap } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  saveKeepers: vi.fn(),
  clearStaleKeepers: vi.fn(),
  hideFile: vi.fn(),
  unhideFile: vi.fn(),
  clearHidden: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/duplicates', () => ({
  saveKeepers: mocks.saveKeepers,
  clearStaleKeepers: mocks.clearStaleKeepers,
}));

vi.mock('../../../server/routes/hidden', () => ({
  hideFile: mocks.hideFile,
  unhideFile: mocks.unhideFile,
  clearHidden: mocks.clearHidden,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { DuplicatesPage } from './DuplicatesPage';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: 'dup.jpg',
  birthtime: '2025-02-11T10:24:00Z',
  hash: 'h1',
  path: `${directory}/dup.jpg`,
});

const groups: DuplicateGroup[] = [
  {
    key: 'h1:dup.jpg',
    hash: 'h1',
    name: 'dup.jpg',
    count: 2,
    size: 6_400,
    redundantSpace: 6_400,
    extension: '.jpg',
    directories: ['C:/Media/2025/Trips', 'C:/Media/2025/Library'],
    files: [entry(1, 'C:/Media/2025/Trips'), entry(2, 'C:/Media/2025/Library')],
  },
];

const file1 = 'C:/Media/2025/Trips/dup.jpg';

function renderPage(initialKeepers: KeeperMap = {}, initialStaleKeepers = 0, hidden: string[] = []) {
  render(
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <DuplicatesPage
          groups={groups}
          initialKeepers={initialKeepers}
          initialStaleKeepers={initialStaleKeepers}
          hidden={hidden}
        />
      </AppProvider>
    </MantineProvider>,
  );
}

function expandGroup() {
  fireEvent.click(screen.getByText('dup.jpg'));
}

function shownDirs() {
  return screen.getAllByText(/^C:\/Media\/2025\/(Trips|Library)$/).map((el) => el.textContent);
}

function chooseHiddenMode(name: string) {
  fireEvent.click(screen.getAllByLabelText('Hidden filter')[0]);
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('DuplicatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveKeepers.mockResolvedValue({ saved: 1 });
    mocks.clearStaleKeepers.mockResolvedValue({ staleKeepers: 0 });
    mocks.hideFile.mockResolvedValue({ hidden: [] });
    mocks.unhideFile.mockResolvedValue({ hidden: [] });
    mocks.clearHidden.mockResolvedValue({ hidden: [] });
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
    renderPage({ 'h1:dup.jpg': 2 });
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
    renderPage({}, 2);
    expect(screen.getByText('2 saved keepers no longer match a group.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved keepers' }));
    await waitFor(() => expect(mocks.clearStaleKeepers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('2 saved keepers no longer match a group.')).not.toBeInTheDocument());
  });

  it('filters the group files by the hidden mode', () => {
    renderPage({}, 0, [file1]);
    expandGroup();
    expect(shownDirs()).toEqual(['C:/Media/2025/Library']);
    chooseHiddenMode('Hidden groups');
    expect(shownDirs()).toEqual(['C:/Media/2025/Trips']);
    chooseHiddenMode('All groups');
    expect(shownDirs()).toEqual(['C:/Media/2025/Trips', 'C:/Media/2025/Library']);
  });

  it('marks a hidden file with a badge', () => {
    renderPage({}, 0, [file1]);
    chooseHiddenMode('All groups');
    expandGroup();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('hides a file with the row action', async () => {
    mocks.hideFile.mockResolvedValue({ hidden: [file1] });
    renderPage();
    expandGroup();
    const row = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mocks.hideFile).toHaveBeenCalledWith({ data: { path: file1 } }));
  });
});
