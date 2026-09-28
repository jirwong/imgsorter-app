import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DuplicatesPage } from './DuplicatesPage';
import type { DuplicateGroup, Entry } from '../../lib/types';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: 'dup.jpg',
  birthtime: '2025-02-11T10:24:00Z',
  hash: 'h1',
  path: `${directory}/dup.jpg`,
});

const groups: DuplicateGroup[] = [
  {
    key: 'h1:dup.jpg',
    hash: 'h1',
    name: 'dup.jpg',
    count: 2,
    size: 6_400,
    redundantSpace: 6_400,
    extension: '.jpg',
    directories: ['C:/Media/2025/Trips', 'C:/Media/2025/Library'],
    files: [entry(1, 'C:/Media/2025/Trips'), entry(2, 'C:/Media/2025/Library')],
  },
];

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DuplicatesPage groups={groups} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DuplicatesPage keepers', () => {
  it('allows at most one keeper per group', () => {
    renderPage();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dup.jpg'));
    expect(screen.getAllByRole('button', { name: 'Keep' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();
    const libraryRow = screen.getByText('C:/Media/2025/Library').closest('tr') as HTMLElement;
    expect(within(libraryRow).getByRole('button', { name: 'Keeper' })).toBeInTheDocument();
    const tripsRow = screen.getByText('C:/Media/2025/Trips').closest('tr') as HTMLElement;
    expect(within(tripsRow).getByRole('button', { name: 'Keep' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keeper' }));
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
  });
});
