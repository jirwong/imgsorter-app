import { createServerFn } from '@tanstack/react-start';

export const startScan = createServerFn({ method: 'POST' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  return scanService.start();
});

export const getScanStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  return scanService.status();
});

export const cancelScan = createServerFn({ method: 'POST' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  scanService.cancel();
  return scanService.status();
});
