import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilePreviewDrawer } from './FilePreviewDrawer';

function renderDrawer() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <FilePreviewDrawer />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('FilePreviewDrawer', () => {
  it('renders nothing while closed', () => {
    renderDrawer();
    expect(screen.queryByText('File details')).not.toBeInTheDocument();
  });
});
