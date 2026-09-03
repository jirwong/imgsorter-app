import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
  };
});

import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { OverviewPage } from './OverviewPage';

describe('OverviewPage', () => {
  it('renders heading, metrics, and largest files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <OverviewPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(
      screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total files')).toBeInTheDocument();
    expect(screen.getByText('Largest files')).toBeInTheDocument();
  });
});
