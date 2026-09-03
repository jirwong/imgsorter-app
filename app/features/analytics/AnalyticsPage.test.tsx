import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { AnalyticsPage } from './AnalyticsPage';

describe('AnalyticsPage', () => {
  it('renders both ranking cards', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <AnalyticsPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('Biggest files')).toBeInTheDocument();
    expect(screen.getByText('Most duplicated')).toBeInTheDocument();
  });
});
