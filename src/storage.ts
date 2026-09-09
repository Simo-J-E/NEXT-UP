import { emptyState, stateSchema, type State } from '../shared/model';

export const DB_NAME = 'next-up-v1';
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () =>
      reject(
        new Error(
          'Local storage could not be opened. Export your data before closing this tab.',
        ),
      );
    request.onblocked = () =>
      reject(new Error('Close other NEXT UP tabs and retry saving.'));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function readState(): Promise<State> {
  const db = await openDB();
  try {
    const data = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('state', 'readonly'),
        request = tx.objectStore('state').get('current');
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(request.error);
    });
    return data === undefined ? emptyState() : stateSchema.parse(data);
  } finally {
    db.close();
  }
}
export async function writeState(state: State): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite', { durability: 'strict' });
      tx.objectStore('state').put(state, 'current');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            'Your changes could not be saved. Storage may be full. Export a backup now.',
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function deleteState() {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function parseBackup(text: string) {
  if (text.length > 30_000_000)
    throw new Error('Backup is too large (30 MB maximum).');
  const parsed = stateSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error(
      'This is not a valid NEXT UP backup. Existing data was kept.',
    );
  return parsed.data;
}
