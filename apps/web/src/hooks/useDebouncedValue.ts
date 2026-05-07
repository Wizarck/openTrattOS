import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. a text input) by `delayMs`. Returns
 * the value unchanged after a quiet period without further updates.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
