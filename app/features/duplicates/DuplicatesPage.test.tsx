import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { DuplicateGroup, Entry, KeeperMap } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  saveKeepers: vi.fn(),
  clearStaleKeepers: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/duplicates', () => ({
  saveKeepers: mocks.saveKeepers,
  clearStaleKeepers: mocks.clearStaleKeepers,
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

function renderPage(initialKeepers: KeeperMap = {}, initialStaleKeepers = 0) {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DuplicatesPage groups={groups} initialKeepers={initialKeepers} initialStaleKeepers={initialStaleKeepers} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DuplicatesPage keepers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveKeepers.mockResolvedValue({ saved: 1 });
    mocks.clearStaleKeepers.mockResolvedValue({ staleKeepers: 0 });
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
});
