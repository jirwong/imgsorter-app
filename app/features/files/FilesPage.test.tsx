import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilesPage } from './FilesPage';
import type { Entry } from '../../lib/types';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `${directory}/file-${id}.jpg`,
});

const files: Entry[] = [entry(1, 'C:/Media/2025'), entry(2, 'C:/Media/2025'), entry(3, 'C:/Media/2024')];

function renderPage(data: Entry[] = files) {
  render(
    <MantineProvider defaultColorScheme="dark" env="test">
      <AppProvider>
        <FilesPage files={data} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('FilesPage', () => {
  it('renders rows from the provided files', () => {
    renderPage();
    expect(screen.getByText('3 files found')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('filters files by directory with the directory picker', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'C:/Media/2024' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('1 files found')).toBeInTheDocument();
  });

  it('shows the file count for each directory option', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'All directories' }));
    const dialog = screen.getByRole('dialog');
    const option = within(dialog).getByText('C:/Media/2025').closest('.directory-option') as HTMLElement;
    expect(within(option).getByText('2')).toBeInTheDocument();
  });
});
