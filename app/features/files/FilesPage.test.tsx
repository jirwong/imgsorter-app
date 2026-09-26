import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilesPage } from './FilesPage';
import { entries } from '../../lib/mock-data';

describe('FilesPage', () => {
  it('renders rows from the provided files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilesPage files={entries.slice(0, 2)} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('2 files found')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
