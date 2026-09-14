// Binds core/store.js to React.
//
// The store is created once at module scope and shared by the whole app, so the
// engine's state is the single source of truth — exactly as on the web.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createStore } from '../../core/store.js';
import { createAsyncStorageAdapter } from './storage';

export const store = createStore(createAsyncStorageAdapter());

/** Subscribe a component to the whole store. */
export function useStoreState() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Load persisted state once on mount. Returns false until the first read lands. */
export function useStoreReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    store.load().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  return ready;
}
