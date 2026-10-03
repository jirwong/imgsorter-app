import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LastScan } from '../../lib/types';

const shell = vi.hoisted(() => ({
  data: {
    files: 1272,
    size: 391_000_000,
    roots: [] as string[],
    extensions: [] as string[],
    duplicateGroups: 24,
    lastScan: null as LastScan | null,
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: () => shell.data,
    useRouter: () => ({ navigate: vi.fn() }),
    Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  };
});

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => ({
    status: 'idle',
    phase: null,
    filesProcessed: 0,
    totalFiles: null,
    currentFile: null,
    currentDirectory: null,
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
    log: [],
  }),
  startScan: vi.fn(),
}));

import { MantineProvider } from '@mantine/core';
import { AppFooter } from './AppFooter';
import { Sidebar } from './Sidebar';

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 4,
};

describe('app shell', () => {
  beforeEach(() => {
    shell.data.lastScan = null;
  });

  it('renders real footer totals', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText('1,272 files')).toBeInTheDocument();
    expect(screen.getByText('391.0 MB indexed')).toBeInTheDocument();
  });

  it('shows the real duplicate group badge', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <Sidebar />
      </MantineProvider>,
    );
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('shows the last scan and its errors', () => {
    shell.data.lastScan = scan;
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText(/Last scan .* · 4 errors/)).toBeInTheDocument();
  });

  it('shows no scan yet when there is no record', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText('No scan yet')).toBeInTheDocument();
  });
});
