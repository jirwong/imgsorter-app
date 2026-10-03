import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { LastScan, ScanState } from '../../lib/types';

const running: ScanState = {
  status: 'running',
  phase: 'scan',
  filesProcessed: 5,
  totalFiles: 10,
  currentFile: 'C:/Media/a.jpg',
  currentDirectory: 'C:/Media/2025',
  startedAt: '10:00:00',
  finishedAt: null,
  summary: null,
  error: null,
  log: [{ time: '10:00:00', event: 'Scan started', directory: 'Fixture tree', status: 'Running' }],
};

const idle: ScanState = {
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
};

const holder = vi.hoisted(() => ({
  scan: undefined as unknown as ScanState,
  lastScan: null as LastScan | null,
}));

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => holder.scan,
  cancelScan: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useLoaderData: () => ({ lastScan: holder.lastScan }) };
});

import { ActivityPage } from './ActivityPage';

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 0,
};

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <ActivityPage />
    </MantineProvider>,
  );
}

describe('ActivityPage', () => {
  beforeEach(() => {
    holder.scan = running;
    holder.lastScan = null;
  });

  it('renders live progress and a cancel action while running', () => {
    renderPage();
    expect(screen.getAllByText('Running')).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel scan' })).toBeInTheDocument();
    expect(screen.getByText('Scan started')).toBeInTheDocument();
  });

  it('shows the saved last scan when idle', () => {
    holder.scan = idle;
    holder.lastScan = scan;
    renderPage();
    expect(screen.getByText(/Last scan /)).toBeInTheDocument();
  });

  it('shows no scan has run yet when idle and empty', () => {
    holder.scan = idle;
    renderPage();
    expect(screen.getByText('No scan has run yet')).toBeInTheDocument();
  });
});
