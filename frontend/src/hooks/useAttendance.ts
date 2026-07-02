import { useMutation } from '@tanstack/react-query';
import { processQrScan } from '../lib/libraryRepository';
import type { ParsedQrPayload } from '../lib/constants';
import type { ScanResult } from '../types';

export type ScanAction = 'time_in' | 'time_out';

export function useProcessScan() {
  return useMutation({
    mutationFn: async ({
      payload,
      purpose,
    }: {
      payload: ParsedQrPayload;
      purpose?: string;
    }): Promise<ScanResult> => {
      return processQrScan(payload, purpose);
    },
  });
}
