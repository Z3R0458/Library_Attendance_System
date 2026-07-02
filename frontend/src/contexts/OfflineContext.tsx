import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { countPendingQueueItems, getMetaValue } from '../lib/offlineDatabase';
import { syncOfflineQueue, warmLocalCache } from '../lib/libraryRepository';
import { OfflineContext, type OfflineContextValue } from './offline';

const SYNC_INTERVAL_MS = 45_000;

export function OfflineProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshQueueState = useCallback(async () => {
    setPendingCount(await countPendingQueueItems());
    setLastSyncedAt(await getMetaValue<string>('last_successful_sync_at'));
  }, []);

  const invalidateOfflineViews = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['currently-inside'] });
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
    void queryClient.invalidateQueries({ queryKey: ['report-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['export-preview'] });
  }, [queryClient]);

  const syncNow = useCallback(async () => {
    setOnline(navigator.onLine);
    setLastError(null);

    if (!navigator.onLine) {
      await refreshQueueState();
      return;
    }

    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      if (result.failed > 0) {
        setLastError('Some offline changes could not be synchronized yet.');
      }
      await refreshQueueState();
      invalidateOfflineViews();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Offline synchronization failed.');
      await refreshQueueState();
    } finally {
      setSyncing(false);
    }
  }, [invalidateOfflineViews, refreshQueueState]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => {
      setOnline(false);
      void refreshQueueState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void refreshQueueState();
    void warmLocalCache().finally(() => {
      void syncNow();
    });

    const intervalId = window.setInterval(() => {
      setOnline(navigator.onLine);
      void syncNow();
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(intervalId);
    };
  }, [refreshQueueState, syncNow]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      online,
      syncing,
      pendingCount,
      lastSyncedAt,
      lastError,
      syncNow,
    }),
    [lastError, lastSyncedAt, online, pendingCount, syncing, syncNow],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
