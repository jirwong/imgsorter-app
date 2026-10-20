import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AnalyticsResult } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  getAnalyticsData: vi.fn(),
}));

vi.mock('../../../server/routes/analytics', () => ({
  getAnalyticsData: mocks.getAnalyticsData,
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

function renderPage(initial: AnalyticsResult = pageResult()) {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AnalyticsPage initial={initial} />
    </MantineProvider>,
  );
}

function choose(label: string, name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnalyticsData.mockResolvedValue(pageResult());
  });

  it('renders both ranking cards from the loader without refetching', () => {
    renderPage();
    expect(screen.getByText('Biggest files')).toBeInTheDocument();
    expect(screen.getByText('Most duplicated')).toBeInTheDocument();
    expect(screen.getByText('×4')).toBeInTheDocument();
    expect(mocks.getAnalyticsData).not.toHaveBeenCalled();
  });

  it('fetches the new page when a page size changes', async () => {
    renderPage();
    choose('Items per page for ranked by size', '25');
    await waitFor(() =>
      expect(mocks.getAnalyticsData).toHaveBeenLastCalledWith({
        data: { sizePage: 1, sizePageSize: 25, copiesPage: 1, copiesPageSize: 10 },
      }),
    );
  });

  it('keeps one ranking page when the other ranking page changes', async () => {
    renderPage();
    const [sizeNext, copiesNext] = screen.getAllByRole('button', { name: 'Next' });
    fireEvent.click(copiesNext);
    await waitFor(() =>
      expect(mocks.getAnalyticsData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ copiesPage: 2, sizePage: 1 }),
      }),
    );
    fireEvent.click(sizeNext);
    await waitFor(() =>
      expect(mocks.getAnalyticsData).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ sizePage: 2, copiesPage: 2 }),
      }),
    );
  });
});
