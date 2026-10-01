import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ScanState } from '../../lib/types';

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

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => running,
  cancelScan: vi.fn(),
}));

import { ActivityPage } from './ActivityPage';

describe('ActivityPage', () => {
  it('renders live progress and a cancel action while running', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <ActivityPage />
      </MantineProvider>,
    );
    expect(screen.getAllByText('Running')).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel scan' })).toBeInTheDocument();
    expect(screen.getByText('Scan started')).toBeInTheDocument();
  });
});
