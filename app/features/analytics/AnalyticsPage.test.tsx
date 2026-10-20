import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AnalyticsResult } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  getAnalyticsPage: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/analytics', () => ({
  getAnalyticsPage: mocks.getAnalyticsPage,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { AnalyticsPage } from './AnalyticsPage';

const pageResult = (overrides: Partial<AnalyticsResult> = {}): AnalyticsResult => ({
  rankedBySize: [
    { filename: 'big-1.jpg', size: 38_400 },
    { filename: 'big-2.jpg', size: 19_200 },
  ],
  totalFiles: 20,
  rankedByCopies: [
    { name: 'duplicate-1.jpg', count: 4 },
    { name: 'duplicate-2.jpg', count: 3 },
  ],
  totalCopies: 20,
  ...overrides,
});

function pageElement(initial: AnalyticsResult) {
  return (
    <MantineProvider defaultColorScheme="dark">
      <AnalyticsPage initial={initial} />
    </MantineProvider>
  );
}

function renderPage(initial: AnalyticsResult = pageResult()) {
  return render(pageElement(initial));
}

function choose(label: string, name: string) {
  const listbox = screen.getByRole('listbox', { name: label, hidden: true });
  fireEvent.click(within(listbox).getByRole('option', { name, hidden: true }));
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnalyticsPage.mockResolvedValue(pageResult());
  });

  it('renders both ranking cards from the loader without refetching', () => {
    renderPage();
    expect(screen.getByText('Biggest files')).toBeInTheDocument();
    expect(screen.getByText('Most duplicated')).toBeInTheDocument();
    expect(screen.getByText('×4')).toBeInTheDocument();
    expect(mocks.getAnalyticsPage).not.toHaveBeenCalled();
  });

  it('fetches the new page when a page size changes', async () => {
    renderPage();
    choose('Items per page for ranked by size', '25');
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: { sizePage: 1, sizePageSize: 25, copiesPage: 1, copiesPageSize: 10 },
      }),
    );
  });

  it('keeps one ranking page when the other ranking page changes', async () => {
    renderPage();
    const [sizeNext, copiesNext] = screen.getAllByRole('button', { name: 'Next' });
    fireEvent.click(copiesNext);
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ copiesPage: 2, sizePage: 1 }),
      }),
    );
    fireEvent.click(sizeNext);
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizePage: 2, copiesPage: 2 }),
      }),
    );
  });

  it('resets the ranking to page one when its page size changes on a later page', async () => {
    renderPage(pageResult({ totalFiles: 50, totalCopies: 50 }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizePage: 2 }),
      }),
    );
    choose('Items per page for ranked by size', '50');
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: { sizePage: 1, sizePageSize: 50, copiesPage: 1, copiesPageSize: 10 },
      }),
    );
  });

  it('shows a toast and keeps the last good page when a refetch fails', async () => {
    renderPage();
    mocks.getAnalyticsPage.mockRejectedValueOnce(new Error('boom'));
    choose('Items per page for ranked by size', '25');
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
    expect(screen.getByText('big-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('×4')).toBeInTheDocument();
  });

  it('refetches the current query when the loader page changes', async () => {
    const refreshed = pageResult({
      rankedBySize: [{ filename: 'fresh.jpg', size: 1 }],
      rankedByCopies: [{ name: 'fresh-dup.jpg', count: 2 }],
    });
    const { rerender } = renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizePage: 2 }),
      }),
    );
    mocks.getAnalyticsPage.mockResolvedValue(refreshed);
    rerender(pageElement(refreshed));
    await waitFor(() =>
      expect(mocks.getAnalyticsPage).toHaveBeenLastCalledWith({
        data: { sizePage: 2, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 },
      }),
    );
    expect(await screen.findByText('fresh.jpg')).toBeInTheDocument();
  });
});
