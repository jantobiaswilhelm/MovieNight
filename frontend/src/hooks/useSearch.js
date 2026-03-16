import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Generic debounced search hook.
 *
 * @param {Function} searchFn - Async function that receives the query string and returns results
 * @param {number} delay - Debounce delay in ms (default 300)
 * @param {Object} options
 * @param {number} options.minLength - Minimum query length to trigger search (default 2)
 */
export function useSearch(searchFn, delay = 300, { minLength = 2 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (query.length < minLength) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await searchFn(query);
        if (mountedRef.current) {
          setResults(data);
        }
      } catch (err) {
        if (mountedRef.current) {
          console.error('Search failed:', err);
          setResults([]);
        }
      } finally {
        if (mountedRef.current) {
          setSearching(false);
        }
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, delay, minLength, searchFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
  }, []);

  return { query, setQuery, results, searching, clear };
}
