import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DirectoryTree } from './DirectoryTree';
import type { DirectoryNode } from '../../lib/types';

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 1,
    size: 10,
    children: [{ label: 'Media', path: 'C:/Media', fileCount: 1, size: 10, children: [] }],
  },
];

function renderTree() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DirectoryTree tree={tree} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DirectoryTree', () => {
  it('renders drive-rooted nodes and has no collapse button', () => {
    renderTree();
    expect(screen.getByText('C:\\')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.queryByLabelText('Collapse directory filter')).not.toBeInTheDocument();
  });

  it('toggles a directory into the filter', () => {
    renderTree();
    fireEvent.click(screen.getByLabelText('Filter C:\\'));
    expect(screen.getByLabelText('Filter C:\\')).toBeChecked();
  });
});
