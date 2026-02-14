import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPersonalMovies, addPersonalMovie, updatePersonalMovie, deletePersonalMovie, searchTMDB, getTMDBMovie, importLetterboxd } from '../api/client';
import './MyMoviesPage.css';

const StarRating = ({ value, editable, onChange, size = 'normal' }) => {
  const [hoverValue, setHoverValue] = useState(0);

  const handleClick = (rating) => {
    if (editable && onChange) {
      onChange(rating);
    }
  };

  const displayValue = hoverValue || value || 0;

  return (
    <div
      className={`star-rating ${editable ? 'editable' : ''} ${size}`}
      onMouseLeave={() => setHoverValue(0)}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
        <span
          key={star}
          className={`star ${star <= displayValue ? 'filled' : ''}`}
          onClick={() => handleClick(star)}
          onMouseEnter={() => editable && setHoverValue(star)}
        >
          {star <= displayValue ? '\u2605' : '\u2606'}
        </span>
      ))}
      {value && <span className="rating-value">{value}/10</span>}
    </div>
  );
};

const PersonalMovieCard = ({ movie, onEdit, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Remove "${movie.title}" from your movies?`)) return;

    setIsDeleting(true);
    try {
      await deletePersonalMovie(movie.id);
      onDelete(movie.id);
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`personal-movie-card ${isDeleting ? 'deleting' : ''}`}>
      <button
        className="personal-movie-remove-btn"
        onClick={handleDelete}
        disabled={isDeleting}
        title="Remove from my movies"
      >
        x
      </button>

      <div className="personal-movie-poster" onClick={() => onEdit(movie)}>
        {movie.image_url ? (
          <img src={movie.image_url} alt={movie.title} />
        ) : (
          <div className="no-poster">No Poster</div>
        )}
      </div>

      <div className="personal-movie-info" onClick={() => onEdit(movie)}>
        <h3 className="personal-movie-title">{movie.title}</h3>

        <div className="personal-movie-meta">
          {movie.release_year && <span className="movie-year">{movie.release_year}</span>}
          {movie.runtime && <span className="movie-runtime">{movie.runtime} min</span>}
        </div>

        {movie.genres && (
          <div className="personal-movie-genres">
            {movie.genres.split(',').slice(0, 2).map((genre, i) => (
              <span key={i} className="genre-tag">{genre.trim()}</span>
            ))}
          </div>
        )}

        {movie.score && (
          <div className="personal-movie-rating">
            <span className="rating-stars">{'★'.repeat(Math.round(movie.score))}</span>
            <span className="rating-number">{parseFloat(movie.score).toFixed(1)}</span>
          </div>
        )}

        {movie.watched_at && (
          <div className="personal-movie-watched">
            Watched {formatDate(movie.watched_at)}
          </div>
        )}

        {movie.comment && (
          <div className="personal-movie-comment">
            "{movie.comment}"
          </div>
        )}
      </div>
    </div>
  );
};

const AddEditMovieModal = ({ isOpen, onClose, onSave, editingMovie }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [score, setScore] = useState(null);
  const [comment, setComment] = useState('');
  const [watchedAt, setWatchedAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const searchTimeout = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current && !editingMovie) {
      inputRef.current.focus();
    }
  }, [isOpen, editingMovie]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedMovie(null);
      setScore(null);
      setComment('');
      setWatchedAt('');
      setError(null);
    } else if (editingMovie) {
      setSelectedMovie({
        id: editingMovie.tmdb_id,
        title: editingMovie.title,
        posterPath: editingMovie.image_url,
        year: editingMovie.release_year,
        runtime: editingMovie.runtime,
        genres: editingMovie.genres
      });
      setScore(editingMovie.score ? parseFloat(editingMovie.score) : null);
      setComment(editingMovie.comment || '');
      setWatchedAt(editingMovie.watched_at ? editingMovie.watched_at.split('T')[0] : '');
    }
  }, [isOpen, editingMovie]);

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
      // Default to today's date when selecting a new movie
      setWatchedAt(new Date().toISOString().split('T')[0]);
    } catch (err) {
      console.error('Failed to get movie details:', err);
      setError('Failed to load movie details');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    if (!selectedMovie) return;

    setIsSaving(true);
    setError(null);

    try {
      if (editingMovie) {
        await updatePersonalMovie(editingMovie.id, {
          score,
          comment: comment || null,
          watched_at: watchedAt || null
        });
      } else {
        await addPersonalMovie({
          tmdb_id: selectedMovie.id,
          title: selectedMovie.title,
          image_url: selectedMovie.posterPath,
          release_year: selectedMovie.year,
          runtime: selectedMovie.runtime,
          genres: selectedMovie.genres,
          score,
          comment: comment || null,
          watched_at: watchedAt || null
        });
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save movie');
    } finally {
      setIsSaving(false);
    }
  };

  const setWatchedToday = () => {
    setWatchedAt(new Date().toISOString().split('T')[0]);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content personal-movie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingMovie ? 'Edit Movie' : 'Add Movie'}</h2>
          <button className="modal-close" onClick={onClose}>x</button>
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
                          {movie.rating > 0 && <span>TMDB {movie.rating}</span>}
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
              {!editingMovie && (
                <button
                  className="back-button"
                  onClick={() => setSelectedMovie(null)}
                >
                  ← Back to search
                </button>
              )}

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
                  </div>
                  {selectedMovie.genres && (
                    <div className="selected-genres">{selectedMovie.genres}</div>
                  )}
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Your Rating (optional)</label>
                <StarRating
                  value={score}
                  editable={true}
                  onChange={setScore}
                  size="large"
                />
                {score && (
                  <button className="clear-rating" onClick={() => setScore(null)}>
                    Clear rating
                  </button>
                )}
              </div>

              <div className="form-section">
                <label className="form-label">When did you watch it?</label>
                <div className="watched-date-row">
                  <input
                    type="date"
                    className="date-input"
                    value={watchedAt}
                    onChange={(e) => setWatchedAt(e.target.value)}
                  />
                  <button type="button" className="btn-secondary today-btn" onClick={setWatchedToday}>
                    Today
                  </button>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Your Review (optional)</label>
                <textarea
                  className="comment-input"
                  placeholder="What did you think of this movie?"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                />
              </div>

              {error && <div className="modal-error">{error}</div>}

              <button
                className="btn-primary save-btn"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : editingMovie ? 'Save Changes' : 'Add to My Movies'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ImportModal = ({ isOpen, onClose, onImported }) => {
  const [ratingsFile, setRatingsFile] = useState(null);
  const [diaryFile, setDiaryFile] = useState(null);
  const [reviewsFile, setReviewsFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setRatingsFile(null);
      setDiaryFile(null);
      setReviewsFile(null);
      setResults(null);
      setError(null);
    }
  }, [isOpen]);

  const handleImport = async () => {
    if (!ratingsFile && !diaryFile) {
      setError('Please select at least a ratings.csv or diary.csv file');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const importResults = await importLetterboxd({
        ratings: ratingsFile,
        diary: diaryFile,
        reviews: reviewsFile
      });
      setResults(importResults);
      if (importResults.imported > 0) {
        onImported();
      }
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import from Letterboxd</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="modal-body">
          {!results ? (
            <>
              <div className="import-instructions">
                <p>Export your data from Letterboxd:</p>
                <ol>
                  <li>Go to <strong>letterboxd.com/settings/data</strong></li>
                  <li>Click <strong>Export Your Data</strong></li>
                  <li>Extract the ZIP and upload the CSV files below</li>
                </ol>
              </div>

              <div className="import-files">
                <div className="file-input-group">
                  <label className="file-label">
                    ratings.csv {ratingsFile && <span className="file-selected">{ratingsFile.name}</span>}
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setRatingsFile(e.target.files[0])}
                    className="file-input"
                  />
                </div>

                <div className="file-input-group">
                  <label className="file-label">
                    diary.csv <span className="optional">(for watch dates)</span>
                    {diaryFile && <span className="file-selected">{diaryFile.name}</span>}
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setDiaryFile(e.target.files[0])}
                    className="file-input"
                  />
                </div>

                <div className="file-input-group">
                  <label className="file-label">
                    reviews.csv <span className="optional">(optional)</span>
                    {reviewsFile && <span className="file-selected">{reviewsFile.name}</span>}
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setReviewsFile(e.target.files[0])}
                    className="file-input"
                  />
                </div>
              </div>

              <div className="import-note">
                <p>Ratings will be converted from Letterboxd's 0.5-5 scale to 1-10.</p>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <button
                className="btn-primary import-btn"
                onClick={handleImport}
                disabled={isImporting || (!ratingsFile && !diaryFile)}
              >
                {isImporting ? 'Importing... (this may take a while)' : 'Import Movies'}
              </button>
            </>
          ) : (
            <div className="import-results">
              <div className="results-summary">
                <div className="result-stat success">
                  <span className="stat-number">{results.imported}</span>
                  <span className="stat-label">Imported</span>
                </div>
                <div className="result-stat skipped">
                  <span className="stat-number">{results.skipped}</span>
                  <span className="stat-label">Skipped</span>
                </div>
                <div className="result-stat total">
                  <span className="stat-number">{results.total}</span>
                  <span className="stat-label">Total</span>
                </div>
              </div>

              {results.failed.length > 0 && (
                <div className="failed-list">
                  <h4>Could not import:</h4>
                  <ul>
                    {results.failed.slice(0, 10).map((item, i) => (
                      <li key={i}>
                        {item.title} {item.year && `(${item.year})`} - {item.reason}
                      </li>
                    ))}
                    {results.failed.length > 10 && (
                      <li className="more">...and {results.failed.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MyMoviesPage = () => {
  const { isAuthenticated } = useAuth();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);

  const fetchMovies = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPersonalMovies(sort);
      setMovies(data);
    } catch (err) {
      setError(err.message || 'Failed to load movies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchMovies();
    } else {
      setLoading(false);
    }
  }, [sort, isAuthenticated]);

  const handleDelete = (id) => {
    setMovies((prev) => prev.filter((m) => m.id !== id));
  };

  const handleEdit = (movie) => {
    setEditingMovie(movie);
  };

  const handleSave = () => {
    fetchMovies();
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingMovie(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="my-movies-page">
        <h1>My Movies</h1>
        <div className="empty-state">
          <p>Login to track movies you've watched</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-movies-page">
      <div className="my-movies-header">
        <h1>My Movies</h1>
        <div className="header-actions">
          <button
            className="btn-secondary import-btn"
            onClick={() => setShowImportModal(true)}
          >
            Import from Letterboxd
          </button>
          <button
            className="btn-primary add-movie-btn"
            onClick={() => setShowAddModal(true)}
          >
            + Add Movie
          </button>
        </div>
      </div>

      <div className="my-movies-controls">
        <select
          className="filter-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="rating">Highest Rated</option>
          <option value="alphabetical">Alphabetical</option>
        </select>
        <span className="movie-count">{movies.length} movie{movies.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : error ? (
        <div className="error-state">{error}</div>
      ) : movies.length === 0 ? (
        <div className="empty-state">
          <p>No movies yet. Start tracking movies you've watched!</p>
          <div className="empty-actions">
            <button
              className="btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              Add Your First Movie
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowImportModal(true)}
            >
              Import from Letterboxd
            </button>
          </div>
        </div>
      ) : (
        <div className="personal-movies-grid">
          {movies.map((movie) => (
            <PersonalMovieCard
              key={movie.id}
              movie={movie}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddEditMovieModal
        isOpen={showAddModal || !!editingMovie}
        onClose={handleCloseModal}
        onSave={handleSave}
        editingMovie={editingMovie}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={handleSave}
      />
    </div>
  );
};

export default MyMoviesPage;
