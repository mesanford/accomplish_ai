import {
  type DocumentData,
  type DocumentReference,
  onSnapshot,
  type Query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/** Subscribe to one document. `ref` must be stable (memoize it) or null to skip. */
export function useDoc<T>(ref: DocumentReference<DocumentData> | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: Boolean(ref), error: null });
  const path = ref?.path ?? null;
  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.message }),
    );
    // The path identifies the document; the ref object itself may be recreated each render.
  }, [path]);
  return state;
}

/** Subscribe to a query. Pass a `key` that changes when the query's meaning changes. */
export function useQuery<T>(query: Query<DocumentData> | null, key: string): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: Boolean(query), error: null });
  useEffect(() => {
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
  }, [key]);
  return state;
}
