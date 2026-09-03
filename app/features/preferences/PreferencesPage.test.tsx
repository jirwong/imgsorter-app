import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { PreferencesPage } from './PreferencesPage';

describe('PreferencesPage', () => {
  it('renders application config tab by default', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <PreferencesPage />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Application configuration' })).toBeInTheDocument();
    expect(screen.getByLabelText('Local database name')).toBeInTheDocument();
  });

  it('switches to directories tab', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <PreferencesPage />
        </AppProvider>
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    expect(screen.getByText('Directories included in scans')).toBeInTheDocument();
    expect(screen.getByText('C:/Media/2025')).toBeInTheDocument();
  });
});
