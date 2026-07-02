import { createContext, useContext } from 'react';

export interface OfflineContextValue {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncNow: () => Promise<void>;
}

export const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOfflineStatus() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOfflineStatus must be used within OfflineProvider');
  return context;
}
