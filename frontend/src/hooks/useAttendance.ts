import { useMutation } from '@tanstack/react-query';
import { processQrScan } from '../lib/libraryRepository';
import type { ScanResult } from '../types';

export type ScanAction = 'time_in' | 'time_out';

export function useProcessScan() {
  return useMutation({
    mutationFn: async ({
      qrToken,
      action,
      purpose,
    }: {
      qrToken: string;
      action?: ScanAction;
      purpose?: string;
    }): Promise<ScanResult> => {
      return processQrScan(qrToken, action, purpose);
    },
  });
}
