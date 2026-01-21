import { useState, useEffect } from 'react';
import { getMyRatedMoviesForFavorites, setFavoriteMovie, searchTMDB, getTMDBMovie } from '../api/client';
import './FavoriteMoviePicker.css';

const FavoriteMoviePicker = ({ position, currentFavorites, onSelect, onClose }) => {
  const [ratedMovies, setRatedMovies] = useState([]);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState('rated'); // 'rated' or 'search'

  useEffect(() => {
    const fetchRatedMovies = async () => {
      try {
        const data = await getMyRatedMoviesForFavorites();
        setRatedMovies(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRatedMovies();
  }, []);

  // TMDB search with debounce
  useEffect(() => {
    if (mode !== 'search' || search.length < 2) {
      setTmdbResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchTMDB(search);
        setTmdbResults(results.slice(0, 20));
      } catch (err) {
        console.error('TMDB search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, mode]);

  // Filter out already favorited movies
  const favoriteIds = new Set(currentFavorites.map(f => f.tmdb_id || f.movie_night_id));

  const filteredRatedMovies = ratedMovies.filter(movie => {
    const matchesSearch = movie.title.toLowerCase().includes(search.toLowerCase());
    const notAlreadyFavorite = !favoriteIds.has(movie.movie_night_id);
    return matchesSearch && notAlreadyFavorite;
  });

  const handleSelectRated = async (movie) => {
    setSubmitting(true);
    try {
      await setFavoriteMovie(position, { movie_night_id: movie.movie_night_id });
      onSelect();
    } catch (err) {
      console.error('Failed to set favorite:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectTMDB = async (movie) => {
    setSubmitting(true);
    try {
      // Get full movie details
      const details = await getTMDBMovie(movie.id);
      await setFavoriteMovie(position, {
        tmdb_id: movie.id,
        title: movie.title,
        image_url: movie.posterPath,
        release_year: movie.year
      });
      onSelect();
    } catch (err) {
      console.error('Failed to set favorite:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="picker-overlay" onClick={handleBackdropClick}>
      <div className="picker-modal">
        <div className="picker-header">
          <h3>Choose Favorite #{position}</h3>
          <button className="picker-close" onClick={onClose}>×</button>
        </div>

        <div className="picker-tabs">
          <button
            className={`picker-tab ${mode === 'rated' ? 'active' : ''}`}
            onClick={() => setMode('rated')}
          >
            My Rated Movies
          </button>
          <button
            className={`picker-tab ${mode === 'search' ? 'active' : ''}`}
            onClick={() => setMode('search')}
          >
            Search All Movies
          </button>
        </div>

        <div className="picker-search">
          <input
            type="text"
            placeholder={mode === 'rated' ? 'Filter your rated movies...' : 'Search for any movie...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="picker-content">
          {mode === 'rated' ? (
            <>
              {loading && <div className="picker-loading">Loading your movies...</div>}
              {error && <div className="picker-error">Error: {error}</div>}
              {!loading && !error && filteredRatedMovies.length === 0 && (
                <div className="picker-empty">
                  {search ? 'No matching movies found' : 'No rated movies available'}
                </div>
              )}
              {!loading && !error && filteredRatedMovies.length > 0 && (
                <div className="picker-list">
                  {filteredRatedMovies.map((movie) => (
                    <button
                      key={movie.movie_night_id}
                      className="picker-item"
                      onClick={() => handleSelectRated(movie)}
                      disabled={submitting}
                    >
                      <div className="picker-item-poster">
                        {movie.image_url ? (
                          <img src={movie.image_url} alt={movie.title} />
                        ) : (
                          <div className="no-poster">?</div>
                        )}
                      </div>
                      <div className="picker-item-info">
                        <span className="picker-item-title">{movie.title}</span>
                        <span className="picker-item-meta">
                          {movie.release_year && <span>{movie.release_year}</span>}
                          <span className="picker-item-score">Your rating: {parseFloat(movie.score).toFixed(1)}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {searchLoading && <div className="picker-loading">Searching...</div>}
              {!searchLoading && search.length < 2 && (
                <div className="picker-empty">Type at least 2 characters to search</div>
              )}
              {!searchLoading && search.length >= 2 && tmdbResults.length === 0 && (
                <div className="picker-empty">No movies found</div>
              )}
              {!searchLoading && tmdbResults.length > 0 && (
                <div className="picker-list">
                  {tmdbResults.map((movie) => (
                    <button
                      key={movie.id}
                      className="picker-item"
                      onClick={() => handleSelectTMDB(movie)}
                      disabled={submitting || favoriteIds.has(movie.id)}
                    >
                      <div className="picker-item-poster">
                        {movie.posterPath ? (
                          <img src={movie.posterPath} alt={movie.title} />
                        ) : (
                          <div className="no-poster">?</div>
                        )}
                      </div>
                      <div className="picker-item-info">
                        <span className="picker-item-title">{movie.title}</span>
                        <span className="picker-item-meta">
                          {movie.year && <span>{movie.year}</span>}
                          {movie.rating && <span className="picker-item-tmdb">TMDB: {movie.rating.toFixed(1)}</span>}
                        </span>
                      </div>
                      {favoriteIds.has(movie.id) && (
                        <span className="picker-item-added">Added</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FavoriteMoviePicker;
