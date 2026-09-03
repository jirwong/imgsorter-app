import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilesPage } from './FilesPage';
import { entries } from '../../lib/mock-data';

describe('FilesPage', () => {
  it('renders all unique-file rows from global filter', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilesPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText(`${entries.length} files found`)).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
