import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useScanStatus } from '../../lib/scan-store';

export function ScanRevalidator() {
  const router = useRouter();
  const status = useScanStatus().status;
  const previous = useRef(status);

  useEffect(() => {
    const settled = status === 'completed' || status === 'cancelled' || status === 'error';
    if (previous.current === 'running' && settled) {
      void router.invalidate();
    }
    previous.current = status;
  }, [status, router]);

  return null;
}
