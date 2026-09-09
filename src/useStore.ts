import { useEffect, useRef, useState } from 'react';
import { emptyState, type State } from '../shared/model';
import { deleteState, readState, writeState } from './storage';

export function useStore() {
  const [state, setState] = useState<State>(emptyState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    readState()
      .then((value) => {
        if (!cancelled) {
          current.current = value;
          setState(value);
        }
      })
      .catch(() => {
        if (!cancelled)
          setStorageError(
            'Could not restore local data. Export a backup before making changes.',
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function update(transform: (old: State) => State): Promise<boolean> {
    const next = transform(current.current);
    current.current = next;
    setState(next);
    const operation = queue.current.then(() => writeState(next));
    queue.current = operation.catch(() => undefined);
    return operation
      .then(() => {
        setStorageError('');
        return true;
      })
      .catch((err: unknown) => {
        setStorageError(
          err instanceof Error
            ? err.message
            : 'Could not save locally. Export a backup.',
        );
        return false;
      });
  }
  async function clear() {
    await queue.current;
    await deleteState();
    current.current = emptyState();
    setState(current.current);
    setStorageError('');
  }
  return { state, current, ready, storageError, update, clear };
}
