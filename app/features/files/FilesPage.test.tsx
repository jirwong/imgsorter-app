import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilesPage } from './FilesPage';
import type { Entry } from '../../lib/types';

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

describe('FilesPage', () => {
  it('renders rows from the provided files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilesPage files={files} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('2 files found')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
