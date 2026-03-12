/**
 * Offline data management.
 * PHI must never persist in IndexedDB after logout.
 * clearOfflineData() must be called on every logout path.
 */

const DB_NAME = "hospici-offline";

/**
 * Clears all offline cached data from IndexedDB.
 * Called on logout to prevent PHI leakage on shared devices.
 */
export async function clearOfflineData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // Force close — logout must not block on this
      resolve();
    };
  });
}
