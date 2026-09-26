import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: () => ({ files: 1272, size: 391_000_000, roots: [], extensions: [] }),
  };
});

import { MantineProvider } from '@mantine/core';
import { AppFooter } from './AppFooter';

describe('app shell', () => {
  it('renders real footer totals', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText('1,272 files')).toBeInTheDocument();
    expect(screen.getByText('391.0 MB indexed')).toBeInTheDocument();
  });
});
