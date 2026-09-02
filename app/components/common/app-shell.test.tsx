import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { AppFooter } from './AppFooter';

describe('app shell', () => {
  it('renders footer totals', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <AppFooter />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('18,426 files')).toBeInTheDocument();
    expect(screen.getByText('2.4 GB indexed')).toBeInTheDocument();
  });
});
