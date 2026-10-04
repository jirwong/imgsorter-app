import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { BrowsePage } from './BrowsePage';
import type { DirectoryNode, Entry } from '../../lib/types';

const files: Entry[] = [1, 2].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 2,
    size: 12_800,
    children: [{ label: 'Media', path: 'C:/Media', fileCount: 2, size: 12_800, children: [] }],
  },
];

describe('BrowsePage', () => {
  it('renders directory filter and results', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <BrowsePage files={files} tree={tree} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('DIRECTORY FILTER')).toBeInTheDocument();
    expect(screen.getByText('2 files found')).toBeInTheDocument();
  });
});
