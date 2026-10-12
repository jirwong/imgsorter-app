import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouterState: (options?: { select?: (state: unknown) => unknown }) =>
      options?.select?.({ location: { pathname: '/browse' } }),
  };
});

import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('shows the view title and no global filters', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <AppHeader />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search files, paths, hashes...')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
