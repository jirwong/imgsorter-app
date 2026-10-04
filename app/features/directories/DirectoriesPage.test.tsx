import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        inLibrary: true,
        lastScannedAt: '2026-10-04T08:00:00.000Z',
        children: [{ label: '2025', path: 'C:/Media/2025', fileCount: 7, size: 7_000, inLibrary: true, children: [] }],
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

function rowFor(label: string): HTMLElement {
  return screen.getByText(label).closest('tr') as HTMLElement;
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

  it('does not offer Reveal outside the library', () => {
    renderPage();
    expect(within(rowFor('C:\\')).queryByRole('button', { name: 'Reveal' })).not.toBeInTheDocument();
  });

  it('reveals a library folder', async () => {
    renderPage();
    fireEvent.click(within(rowFor('Media')).getByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(mocks.revealFolder).toHaveBeenCalledWith({ data: { path: 'C:/Media' } }));
  });

  it('filters Browse by a folder', () => {
    renderPage();
    fireEvent.click(within(rowFor('Media')).getByRole('button', { name: 'Filter' }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const call = mocks.navigate.mock.calls[0][0];
    expect(call.to).toBe('/browse');
    expect(typeof call.search).toBe('function');
    expect(call.search({ selectedDirs: [] })).toEqual({ selectedDirs: ['C:/Media'] });
  });

  it('copies a path', async () => {
    renderPage();
    fireEvent.click(within(rowFor('Media')).getByRole('button', { name: 'Copy path' }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('C:/Media'));
  });

  it('reports an error when the clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    renderPage();
    fireEvent.click(within(rowFor('Media')).getByRole('button', { name: 'Copy path' }));
    expect(mocks.notifyShow).toHaveBeenCalledWith({ color: 'red', message: 'Could not copy the path.' });
  });
});
