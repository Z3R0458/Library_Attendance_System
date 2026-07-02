import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTO_LOGOUT_WINDOW_MINUTES, LIBRARY_AUTO_LOGOUT_TIMES, TIMEZONE } from '../lib/constants';
import { autoLogoutAll } from '../lib/libraryRepository';

const CHECK_INTERVAL_MS = 30_000;
const STORAGE_PREFIX = 'library-auto-logout';

function getManilaNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const hourText = valueOf('hour');

  return {
    dateKey: `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`,
    hour: hourText === '24' ? 0 : Number(hourText),
    minute: Number(valueOf('minute')),
  };
}

export function useScheduledAutoLogout(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const invalidateAttendanceViews = () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['currently-inside'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
    };

    const runDueClosures = async () => {
      const now = getManilaNowParts();
      const currentMinutes = now.hour * 60 + now.minute;

      for (const closure of LIBRARY_AUTO_LOGOUT_TIMES) {
        const closureMinutes = closure.hour * 60 + closure.minute;
        const minutesAfterClosure = currentMinutes - closureMinutes;

        if (minutesAfterClosure < 0 || minutesAfterClosure > AUTO_LOGOUT_WINDOW_MINUTES) {
          continue;
        }

        const storageKey = `${STORAGE_PREFIX}:${now.dateKey}:${closure.id}`;
        if (window.localStorage.getItem(storageKey)) {
          continue;
        }

        window.localStorage.setItem(storageKey, new Date().toISOString());

        try {
          await autoLogoutAll();
        } catch (error) {
          window.localStorage.removeItem(storageKey);
          console.error(`Unable to run ${closure.label} auto-logout:`, error);
          continue;
        }

        if (!cancelled) invalidateAttendanceViews();
      }
    };

    void runDueClosures();
    const intervalId = window.setInterval(() => {
      void runDueClosures();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, queryClient]);
}
