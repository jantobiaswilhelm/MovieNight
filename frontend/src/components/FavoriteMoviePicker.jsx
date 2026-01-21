import { useState, useEffect } from 'react';
import { getMyRatedMoviesForFavorites, setFavoriteMovie } from '../api/client';
import './FavoriteMoviePicker.css';

const FavoriteMoviePicker = ({ position, currentFavorites, onSelect, onClose }) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const data = await getMyRatedMoviesForFavorites();
        setMovies(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, []);

  // Filter out already favorited movies
  const favoriteIds = new Set(currentFavorites.map(f => f.movie_night_id));

  const filteredMovies = movies.filter(movie => {
    const matchesSearch = movie.title.toLowerCase().includes(search.toLowerCase());
    const notAlreadyFavorite = !favoriteIds.has(movie.movie_night_id);
    return matchesSearch && notAlreadyFavorite;
  });

  const handleSelect = async (movieNightId) => {
    setSubmitting(true);
    try {
      await setFavoriteMovie(movieNightId, position);
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

        <div className="picker-search">
          <input
            type="text"
            placeholder="Search your rated movies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="picker-content">
          {loading && <div className="picker-loading">Loading your movies...</div>}
          {error && <div className="picker-error">Error: {error}</div>}
          {!loading && !error && filteredMovies.length === 0 && (
            <div className="picker-empty">
              {search ? 'No matching movies found' : 'No rated movies available'}
            </div>
          )}
          {!loading && !error && filteredMovies.length > 0 && (
            <div className="picker-list">
              {filteredMovies.map((movie) => (
                <button
                  key={movie.movie_night_id}
                  className="picker-item"
                  onClick={() => handleSelect(movie.movie_night_id)}
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
        </div>
      </div>
    </div>
  );
};

export default FavoriteMoviePicker;
