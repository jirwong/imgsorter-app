import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AnalyticsPage } from './AnalyticsPage';
import type { AnalyticsData } from '../../lib/types';

const data: AnalyticsData = {
  rankedBySize: [
    { filename: 'big-1.jpg', size: 38_400 },
    { filename: 'big-2.jpg', size: 19_200 },
  ],
  rankedByCopies: [
    { name: 'duplicate-1.jpg', count: 4 },
    { name: 'duplicate-2.jpg', count: 3 },
  ],
};

describe('AnalyticsPage', () => {
  it('renders both ranking cards', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AnalyticsPage data={data} />
      </MantineProvider>,
    );
    expect(screen.getByText('Biggest files')).toBeInTheDocument();
    expect(screen.getByText('Most duplicated')).toBeInTheDocument();
    expect(screen.getByText('×4')).toBeInTheDocument();
  });
});
