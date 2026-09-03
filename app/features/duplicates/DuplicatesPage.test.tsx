import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DuplicatesPage } from './DuplicatesPage';

describe('DuplicatesPage', () => {
  it('renders group table with keepers prompt', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <DuplicatesPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('3 groups · 10 files · 0 keepers')).toBeInTheDocument();
    expect(screen.getByText('mountain-lake.jpg')).toBeInTheDocument();
  });
});
