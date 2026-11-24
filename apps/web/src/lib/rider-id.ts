let riderId: Promise<string> | undefined;

// A read-write IndexedDB transaction serializes first use across browser tabs.
export function bookingRiderId(): Promise<string> {
  riderId ??= new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('rehop-booking', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('identity');
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Browser storage is blocked'));
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('identity', 'readwrite');
      const store = transaction.objectStore('identity');
      const lookup = store.get('rider');
      let id: string;
      lookup.onsuccess = () => {
        if (typeof lookup.result === 'string') id = lookup.result;
        else {
          id = crypto.randomUUID();
          store.put(id, 'rider');
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(id);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  }).catch((error: unknown) => {
    riderId = undefined;
    throw error;
  });
  return riderId;
}
