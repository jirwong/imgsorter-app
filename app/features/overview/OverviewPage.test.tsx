import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
  };
});

import { MantineProvider } from '@mantine/core';
import { OverviewPage } from './OverviewPage';
import { entries } from '../../lib/mock-data';
import type { OverviewData } from '../../lib/types';

const data: OverviewData = {
  totalFiles: 1272,
  totalSize: 391_000_000,
  duplicateGroups: 24,
  redundantSpace: 30_720_000,
  uniqueFiles: 1200,
  storageMap: [
    { path: 'C:/Media/2025', share: 52, size: 200_000_000 },
    { path: 'C:/Media/2024', share: 30, size: 120_000_000 },
    { path: 'D:/Camera Imports', share: 18, size: 71_000_000 },
  ],
  largestFiles: entries.slice(0, 4),
};

describe('OverviewPage', () => {
  it('renders heading, real metrics, and largest files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <OverviewPage data={data} />
      </MantineProvider>,
    );
    expect(
      screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total files')).toBeInTheDocument();
    expect(screen.getByText('1,272')).toBeInTheDocument();
    expect(screen.getByText('Not backed up')).toBeInTheDocument();
    expect(screen.getAllByText('C:/Media/2025').length).toBeGreaterThan(0);
    expect(screen.getByText('Largest files')).toBeInTheDocument();
  });
});
