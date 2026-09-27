import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DuplicatesPage } from './DuplicatesPage';
import type { DuplicateGroup, Entry } from '../../lib/types';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 640_000,
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
    size: 640_000,
    redundantSpace: 640_000,
    extension: '.jpg',
    directories: ['C:/Media/2025/Trips', 'C:/Media/2025/Library'],
    files: [entry(1, 'C:/Media/2025/Trips'), entry(2, 'C:/Media/2025/Library')],
  },
];

describe('DuplicatesPage', () => {
  it('renders the provided groups with a zero-keeper summary', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <DuplicatesPage groups={groups} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
    expect(screen.getByText('dup.jpg')).toBeInTheDocument();
  });
});
