import { useState, useRef, useEffect, useCallback } from 'react';
import { searchTMDB, getTMDBMovie } from '../api/client';

/**
 * Debounced TMDB search hook.
 * Used in Home.jsx announce flow, MyMoviesPage, AddToWishlistModal, etc.
 *
 * @param {Object} options
 * @param {number} options.debounce - Debounce delay in ms (default 300)
 * @param {number} options.minLength - Minimum query length to trigger search (default 2)
 */
export function useTMDBSearch({ debounce = 300, minLength = 2 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (query.length < minLength) {
      setResults([]);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const data = await searchTMDB(query);
        setResults(data);
      } catch (err) {
        console.error('TMDB search failed:', err);
        setError('Failed to search movies');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, debounce);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, debounce, minLength]);

  const selectMovie = useCallback(async (movie) => {
    setSearching(true);
    setError(null);
    try {
      const details = await getTMDBMovie(movie.id);
      setSelectedMovie(details);
      setQuery('');
      setResults([]);
      return details;
    } catch (err) {
      console.error('Failed to get movie details:', err);
      setError('Failed to load movie details');
      return null;
    } finally {
      setSearching(false);
    }
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedMovie(null);
    setError(null);
  }, []);

  return { query, setQuery, results, searching, selectedMovie, setSelectedMovie, error, selectMovie, clear };
}
