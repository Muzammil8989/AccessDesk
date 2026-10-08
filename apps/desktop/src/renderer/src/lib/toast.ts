import { useSyncExternalStore } from 'react';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Errors stay until dismissed: an error that vanishes on a timer can be missed. */
const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  success: 5000,
  info: 5000,
  error: null,
};

const MAX_VISIBLE = 4;

let items: ToastItem[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  if (!items.some((item) => item.id === id)) return;
  items = items.filter((item) => item.id !== id);
  emit();
}

function show(kind: ToastKind, message: string): number {
  const id = nextId++;
  items = [...items, { id, kind, message }].slice(-MAX_VISIBLE);
  const delay = AUTO_DISMISS_MS[kind];
  if (delay !== null)
    timers.set(
      id,
      setTimeout(() => dismissToast(id), delay),
    );
  emit();
  return id;
}

/**
 * Short, non-blocking notices for things that happened in the background. The result of an
 * action the user is looking at (a failed field, a connection test) belongs inline instead.
 */
export const toast = {
  success: (message: string) => show('success', message),
  info: (message: string) => show('info', message),
  error: (message: string) => show('error', message),
};

export function clearToasts(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  items = [];
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items);
}
