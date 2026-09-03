import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { ActivityPage } from './ActivityPage';

describe('ActivityPage', () => {
  it('renders current scan and event log', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <ActivityPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('No active scan')).toBeInTheDocument();
    expect(screen.getByText('Scan completed')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
  });
});
