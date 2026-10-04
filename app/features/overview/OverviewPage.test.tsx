import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Entry, LastScan, OverviewData } from '../../lib/types';

const shell = vi.hoisted(() => ({ lastScan: null as LastScan | null }));
const mocks = vi.hoisted(() => ({ getThumbnails: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
    useLoaderData: () => ({ lastScan: shell.lastScan }),
  };
});

vi.mock('../../../server/routes/thumbnails', () => ({ getThumbnails: mocks.getThumbnails }));

import { MantineProvider } from '@mantine/core';
import { OverviewPage } from './OverviewPage';

const entries: Entry[] = [1, 2, 3, 4].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));

const data: OverviewData = {
  totalFiles: 1272,
  totalSize: 391_000_000,
  duplicateGroups: 24,
  redundantSpace: 307_200,
  uniqueFiles: 1200,
  storageMap: [
    { path: 'C:/Media/2025', share: 52, size: 200_000_000 },
    { path: 'C:/Media/2024', share: 30, size: 120_000_000 },
    { path: 'D:/Camera Imports', share: 18, size: 71_000_000 },
  ],
  largestFiles: entries,
};

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 3,
};

function renderPage() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <OverviewPage data={data} />
    </MantineProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    shell.lastScan = null;
    vi.clearAllMocks();
    mocks.getThumbnails.mockResolvedValue({});
  });

  it('renders heading, real metrics, and largest files', () => {
    renderPage();
    expect(
      screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total files')).toBeInTheDocument();
    expect(screen.getByText('1,272')).toBeInTheDocument();
    expect(screen.queryByText('Not backed up')).not.toBeInTheDocument();
    expect(screen.getAllByText('C:/Media/2025').length).toBeGreaterThan(0);
    expect(screen.getByText('Largest files')).toBeInTheDocument();
  });

  it('shows the last run summary and errors', () => {
    shell.lastScan = scan;
    renderPage();
    expect(screen.getByText(/Last scan /)).toBeInTheDocument();
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('Files scanned')).toBeInTheDocument();
    expect(screen.getByText(/3 errors during the scan/)).toBeInTheDocument();
  });

  it('shows no scan yet without a record', () => {
    renderPage();
    expect(screen.getByText('No scan yet')).toBeInTheDocument();
  });

  it('renders fetched previews', async () => {
    mocks.getThumbnails.mockResolvedValue({ 1: 'data:image/webp;base64,AAAA' });
    const { container } = renderPage();
    await waitFor(() => expect(mocks.getThumbnails).toHaveBeenCalledWith({ data: { ids: [1, 2, 3, 4] } }));
    await waitFor(() => expect(container.querySelector('.file-row img')).toBeInTheDocument());
  });

  it('shows placeholders when there is no preview', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('.thumb-placeholder')).toHaveLength(4);
  });
});
