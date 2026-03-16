import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for fetching data with loading/error/data state management.
 * Handles cleanup on unmount and dependency changes.
 *
 * @param {Function} fetchFn - Async function that returns a promise with data
 * @param {Array} deps - Dependency array for when to re-fetch
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to fetch (default true)
 * @param {*} options.initialData - Initial data value (default null)
 */
export function useFetch(fetchFn, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      // Only update state if this is still the latest fetch and component is mounted
      if (mountedRef.current && fetchId === fetchIdRef.current) {
        setData(result);
        setLoading(false);
      }
      return result;
    } catch (err) {
      if (mountedRef.current && fetchId === fetchIdRef.current) {
        setError(err.message || 'An error occurred');
        setLoading(false);
      }
      throw err;
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { data, loading, error, refetch, setData };
}
