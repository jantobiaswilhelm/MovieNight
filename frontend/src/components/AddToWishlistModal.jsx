import { useState, useEffect, useRef } from 'react';
import { searchTMDB, getTMDBMovie, addToWishlist } from '../api/client';
import './AddToWishlistModal.css';

const IMPORTANCE_LABELS = {
  1: 'Low',
  2: 'Below Average',
  3: 'Medium',
  4: 'High',
  5: 'Must Watch'
};

const AddToWishlistModal = ({ isOpen, onClose, onAdded }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [importance, setImportance] = useState(3);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(null);
  const searchTimeout = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedMovie(null);
      setImportance(3);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (query.length < 2) {
      setResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchTMDB(query);
        setResults(data);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [query]);

  const handleSelectMovie = async (movie) => {
    setIsSearching(true);
    try {
      const details = await getTMDBMovie(movie.id);
      setSelectedMovie(details);
      setQuery('');
      setResults([]);
    } catch (err) {
      console.error('Failed to get movie details:', err);
      setError('Failed to load movie details');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedMovie) return;

    setIsAdding(true);
    setError(null);

    try {
      await addToWishlist({
        title: selectedMovie.title,
        image_url: selectedMovie.posterPath,
        backdrop_url: selectedMovie.backdropPath,
        description: selectedMovie.overview,
        tmdb_id: selectedMovie.id,
        imdb_id: selectedMovie.imdbId,
        tmdb_rating: selectedMovie.rating,
        genres: selectedMovie.genres,
        runtime: selectedMovie.runtime,
        release_year: selectedMovie.year,
        trailer_url: selectedMovie.trailerUrl,
        importance
      });

      if (onAdded) {
        onAdded();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add to wishlist');
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wishlist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add to Wishlist</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!selectedMovie ? (
            <>
              <div className="search-section">
                <input
                  ref={inputRef}
                  type="text"
                  className="search-input"
                  placeholder="Search for a movie..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {isSearching && (
                <div className="search-loading">Searching...</div>
              )}

              {results.length > 0 && (
                <div className="search-results">
                  {results.map((movie) => (
                    <div
                      key={movie.id}
                      className="search-result-item"
                      onClick={() => handleSelectMovie(movie)}
                    >
                      <div className="result-poster">
                        {movie.posterPath ? (
                          <img src={movie.posterPath} alt={movie.title} />
                        ) : (
                          <div className="no-poster">No Poster</div>
                        )}
                      </div>
                      <div className="result-info">
                        <div className="result-title">{movie.title}</div>
                        <div className="result-meta">
                          {movie.year && <span>{movie.year}</span>}
                          {movie.rating > 0 && <span>★ {movie.rating}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {query.length >= 2 && !isSearching && results.length === 0 && (
                <div className="no-results">No movies found</div>
              )}
            </>
          ) : (
            <div className="selected-movie">
              <button
                className="back-button"
                onClick={() => setSelectedMovie(null)}
              >
                ← Back to search
              </button>

              <div className="selected-movie-content">
                <div className="selected-poster">
                  {selectedMovie.posterPath ? (
                    <img src={selectedMovie.posterPath} alt={selectedMovie.title} />
                  ) : (
                    <div className="no-poster">No Poster</div>
                  )}
                </div>

                <div className="selected-info">
                  <h3>{selectedMovie.title}</h3>
                  <div className="selected-meta">
                    {selectedMovie.year && <span>{selectedMovie.year}</span>}
                    {selectedMovie.runtime && <span>{selectedMovie.runtime} min</span>}
                    {selectedMovie.rating > 0 && <span>★ {selectedMovie.rating}</span>}
                  </div>
                  {selectedMovie.genres && (
                    <div className="selected-genres">{selectedMovie.genres}</div>
                  )}
                  {selectedMovie.overview && (
                    <p className="selected-overview">{selectedMovie.overview}</p>
                  )}
                </div>
              </div>

              <div className="importance-section">
                <label className="importance-main-label">Priority Level</label>
                <div className="importance-selector">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      className={`importance-btn ${importance === level ? 'selected' : ''}`}
                      onClick={() => setImportance(level)}
                    >
                      <span className="importance-stars">
                        {'★'.repeat(level)}{'☆'.repeat(5 - level)}
                      </span>
                      <span className="importance-text">{IMPORTANCE_LABELS[level]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <button
                className="btn-primary add-btn"
                onClick={handleAdd}
                disabled={isAdding}
              >
                {isAdding ? 'Adding...' : 'Add to Wishlist'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddToWishlistModal;
