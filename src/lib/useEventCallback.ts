import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable event handlers for memoized views; always use the latest committed state. */
export function useEventCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const current = useRef(callback);
  useLayoutEffect(() => {
    current.current = callback;
  });
  return useCallback((...args: Args): Result => current.current(...args), []);
}
