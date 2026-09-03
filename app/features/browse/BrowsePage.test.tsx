import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { BrowsePage } from './BrowsePage';
import { entries } from '../../lib/mock-data';

describe('BrowsePage', () => {
  it('renders directory filter and results', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <BrowsePage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('DIRECTORY FILTER')).toBeInTheDocument();
    expect(screen.getByText(`${entries.length} files found`)).toBeInTheDocument();
  });
});
