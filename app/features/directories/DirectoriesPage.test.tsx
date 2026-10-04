import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { DirectoryNode } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  revealFolder: vi.fn(),
  navigate: vi.fn(),
  notifyShow: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../../server/routes/native', () => ({ revealFolder: mocks.revealFolder }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notifyShow } }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ navigate: mocks.navigate }) };
});

import { DirectoriesPage } from './DirectoriesPage';

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 7,
    size: 7_000,
    children: [
      {
        label: 'Media',
        path: 'C:/Media',
        fileCount: 7,
        size: 7_000,
        isRoot: true,
        lastScannedAt: '2026-10-04T08:00:00.000Z',
        children: [{ label: '2025', path: 'C:/Media/2025', fileCount: 7, size: 7_000, children: [] }],
      },
    ],
  },
];

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <DirectoriesPage tree={tree} />
    </MantineProvider>,
  );
}

describe('DirectoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revealFolder.mockResolvedValue({ ok: true });
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: mocks.writeText }, configurable: true });
  });

  it('renders drive, folder, and count rows', () => {
    renderPage();
    expect(screen.getByText('C:\\')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });

  it('reveals a folder', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reveal' })[0]);
    await waitFor(() => expect(mocks.revealFolder).toHaveBeenCalledWith({ data: { path: 'C:' } }));
  });

  it('filters Browse by a folder', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Filter' })[0]);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/browse', search: { selectedDirs: ['C:'] } });
  });

  it('copies a path', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy path' })[0]);
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('C:'));
  });
});
