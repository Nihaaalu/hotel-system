import { getUnsyncedRecords } from '../db/localDb';

export interface SyncStatusInfo {
  status: 'idle' | 'syncing' | 'error' | 'success';
  lastSynced: string | null;
  unsyncedCount: number;
  message: string;
}

// Global state for subscribers
let syncState: SyncStatusInfo = {
  status: 'success',
  lastSynced: new Date().toLocaleTimeString(),
  unsyncedCount: 0,
  message: 'Local operations secure (offline first)',
};

type SyncSubscriber = (state: SyncStatusInfo) => void;
const subscribers = new Set<SyncSubscriber>();

export function subscribeToSyncChanges(callback: SyncSubscriber) {
  subscribers.add(callback);
  callback(syncState); // Emit current state
  return () => {
    subscribers.delete(callback);
  };
}

function updateSyncState(updates: Partial<SyncStatusInfo>) {
  syncState = { ...syncState, ...updates };
  subscribers.forEach((cb) => cb(syncState));
}

export function getSyncState() {
  return syncState;
}

/**
 * Perform Cloud Sync background process (Temporarily Mocked)
 */
export async function syncLocalToCloud(): Promise<void> {
  const unsynced = await getUnsyncedRecords();
  const totalUnsynced =
    unsynced.guests.length + unsynced.bookings.length + unsynced.payments.length;

  updateSyncState({
    status: 'success',
    unsyncedCount: totalUnsynced,
    lastSynced: new Date().toLocaleTimeString(),
    message: totalUnsynced > 0 ? `${totalUnsynced} changes local-only` : 'No sync needed',
  });
}

/**
 * Initializes listeners and polling for offline-first sync (Temporarily Mocked)
 */
export function initSyncService() {
  const handleOnline = () => {
    updateSyncState({
      status: 'success',
      message: 'Local operations secure (browser is online)',
    });
  };

  const handleOffline = () => {
    updateSyncState({
      status: 'idle',
      message: 'Network offline - operating safely offline',
    });
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial calculation of unsynced counts
  getUnsyncedRecords().then((unsynced) => {
    const total = unsynced.guests.length + unsynced.bookings.length + unsynced.payments.length;
    updateSyncState({
      unsyncedCount: total,
      message: 'Local operations secure',
    });
  });

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
