import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ScanResult } from '../types';

export type ScanAction = 'time_in' | 'time_out';

export function useProcessScan() {
  return useMutation({
    mutationFn: async ({
      qrToken,
      action,
    }: {
      qrToken: string;
      action?: ScanAction;
    }): Promise<ScanResult> => {
      const { data, error } = await supabase.rpc('process_qr_scan', {
        p_qr_token: qrToken,
        p_scan_action: action ?? null,
      });

      if (error) {
        const isAlreadyLoggedInError =
          error.code === '23505' ||
          error.message.includes('idx_attendance_one_active_visit_per_student_day');

        return {
          success: false,
          message: isAlreadyLoggedInError
            ? 'This student is already logged in. Please log out first before logging in again.'
            : error.message,
          error: isAlreadyLoggedInError ? 'already_checked_in' : 'invalid_qr',
        };
      }

      return data as ScanResult;
    },
  });
}
