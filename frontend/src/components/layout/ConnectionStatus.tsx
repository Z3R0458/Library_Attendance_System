import { useOfflineStatus } from '../../contexts/offline';

export function ConnectionStatus() {
  const { online, syncing, pendingCount, lastError, syncNow } = useOfflineStatus();
  const title = lastError
    ? `${lastError} ${pendingCount} change(s) pending.`
    : pendingCount > 0
      ? `${pendingCount} offline change(s) waiting to synchronize.`
      : online
        ? 'Online. Local data is ready for offline use.'
        : 'Offline. Changes are being saved locally.';

  return (
    <button
      type="button"
      className={`connection-status ${online ? 'online' : 'offline'}${lastError ? ' warning' : ''}`}
      title={title}
      onClick={() => {
        void syncNow();
      }}
    >
      <span className="connection-dot" aria-hidden="true" />
      <span>{syncing ? 'Syncing' : online ? 'Online' : 'Offline'}</span>
      {pendingCount > 0 && <strong>{pendingCount}</strong>}
    </button>
  );
}
