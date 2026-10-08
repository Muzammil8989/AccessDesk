import { useCallback, useSyncExternalStore } from 'react';

const supported = () => typeof window.matchMedia === 'function';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!supported()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => supported() && window.matchMedia(query).matches);
}
