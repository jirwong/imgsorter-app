import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ writeText: vi.fn(), notifyShow: vi.fn() }));

vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notifyShow } }));

import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: mocks.writeText }, configurable: true });
  });

  it('writes the text and shows the success message', async () => {
    copyToClipboard('C:/Media', 'Path copied.', 'Could not copy the path.');
    expect(mocks.writeText).toHaveBeenCalledWith('C:/Media');
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith({ color: 'cyan', message: 'Path copied.' }));
  });

  it('shows the error message when the write fails', async () => {
    mocks.writeText.mockRejectedValue(new Error('nope'));
    copyToClipboard('C:/Media', 'Path copied.', 'Could not copy the path.');
    await waitFor(() =>
      expect(mocks.notifyShow).toHaveBeenCalledWith({ color: 'red', message: 'Could not copy the path.' }),
    );
  });

  it('shows the error message when the clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    copyToClipboard('C:/Media', 'Path copied.', 'Could not copy the path.');
    expect(mocks.notifyShow).toHaveBeenCalledWith({ color: 'red', message: 'Could not copy the path.' });
  });
});
