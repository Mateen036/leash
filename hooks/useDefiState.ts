"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchState, type DefiState } from "@/lib/defi/client";
type Snapshot = { state: DefiState | null; loading: boolean; error: string };
type Entry = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  pending?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
};
const empty: Snapshot = { state: null, loading: false, error: "" };
const entries = new Map<string, Entry>();
function entry(id: string) {
  if (!entries.has(id))
    entries.set(id, { snapshot: empty, listeners: new Set() });
  return entries.get(id)!;
}
export async function refreshDefiState(id: string) {
  if (!id) return;
  const e = entry(id);
  if (e.pending) return e.pending;
  e.pending = (async () => {
    try {
      e.snapshot = { state: await fetchState(id), loading: false, error: "" };
    } catch (error) {
      e.snapshot = {
        ...e.snapshot,
        loading: false,
        error: String((error as Error).message),
      };
    } finally {
      e.pending = undefined;
      e.listeners.forEach((fn) => fn());
    }
  })();
  return e.pending;
}
export function useDefiState(accountId: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!accountId) return () => {};
      const e = entry(accountId);
      e.listeners.add(listener);
      if (!e.timer) {
        void refreshDefiState(accountId);
        e.timer = setInterval(() => void refreshDefiState(accountId), 8000);
      }
      return () => {
        e.listeners.delete(listener);
        if (!e.listeners.size) {
          clearInterval(e.timer);
          e.timer = undefined;
        }
      };
    },
    [accountId],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(
      () => (accountId ? entry(accountId).snapshot : empty),
      [accountId],
    ),
    () => empty,
  );
  const data = snapshot.state?.exists ? snapshot.state : null;
  return { ...snapshot, ...data, refresh: () => refreshDefiState(accountId) };
}
