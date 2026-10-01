import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: () => ({ files: 1272, size: 391_000_000, roots: [], extensions: [], duplicateGroups: 24 }),
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

describe('app shell', () => {
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
});
