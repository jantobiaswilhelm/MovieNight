import { useState, useEffect, useCallback } from 'react';

/**
 * Generic hook for async data fetching.
 * Replaces the repeated useState+useEffect+try/catch pattern.
 *
 * @param {Function} fetchFn - Async function that returns data
 * @param {Array} deps - Dependency array for when to re-fetch
 * @param {Object} options - { enabled: boolean, initialData: any }
 */
export function useAsyncData(fetchFn, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
      return result;
    } catch (err) {
      setError(err.message || 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refetch().catch(() => {});
  }, [...deps, enabled]);

  return { data, loading, error, refetch, setData };
}
