import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovies, deleteMovie } from '../api/client';
import './MoviesPage.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'rating-high', label: 'Highest Rated' },
  { value: 'rating-low', label: 'Lowest Rated' },
  { value: 'votes', label: 'Most Votes' },
  { value: 'alpha', label: 'A-Z' },
  { value: 'alpha-reverse', label: 'Z-A' }
];

const MoviesPage = () => {
  const { isAdmin } = useAuth();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [deleting, setDeleting] = useState(null);

  const fetchMovies = async () => {
    try {
      const data = await getMovies(500, 0);
      setMovies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  const handleDelete = async (e, movieId, movieTitle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${movieTitle}"? This will also delete all ratings.`)) {
      return;
    }

    setDeleting(movieId);
    try {
      await deleteMovie(movieId);
      setMovies(movies.filter(m => m.id !== movieId));
    } catch (err) {
      alert('Failed to delete movie: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  const availableMonths = useMemo(() => {
    const months = new Set();
    movies.forEach((movie) => {
      if (movie.scheduled_at) {
        const date = new Date(movie.scheduled_at);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthStr);
      }
    });
    return Array.from(months).sort().reverse();
  }, [movies]);

  const filteredAndSortedMovies = useMemo(() => {
    let result = [...movies];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(query)
      );
    }

    // Filter by month
    if (selectedMonth) {
      result = result.filter((movie) => {
        if (!movie.scheduled_at) return false;
        const date = new Date(movie.scheduled_at);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === selectedMonth;
      });
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        break;
      case 'rating-high':
        result.sort((a, b) => parseFloat(b.avg_rating || 0) - parseFloat(a.avg_rating || 0));
        break;
      case 'rating-low':
        result.sort((a, b) => parseFloat(a.avg_rating || 0) - parseFloat(b.avg_rating || 0));
        break;
      case 'votes':
        result.sort((a, b) => parseInt(b.rating_count || 0) - parseInt(a.rating_count || 0));
        break;
      case 'alpha':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'alpha-reverse':
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      default:
        break;
    }

    return result;
  }, [movies, searchQuery, selectedMonth, sortBy]);

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return <div className="loading">Loading movies...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="movies-page">
      <h1>All Movies</h1>

      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="filter-select"
          >
            <option value="">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="results-count">
        {filteredAndSortedMovies.length} movie{filteredAndSortedMovies.length !== 1 ? 's' : ''} found
      </div>

      {filteredAndSortedMovies.length === 0 ? (
        <div className="empty-state">
          <p>No movies found matching your criteria.</p>
        </div>
      ) : (
        <div className="movies-grid">
          {filteredAndSortedMovies.map((movie) => (
            <div key={movie.id} className="movie-card-wrapper">
              <Link to={`/movie/${movie.id}`} className="movie-card">
                <div className="movie-poster">
                  {movie.image_url ? (
                    <img src={movie.image_url} alt={movie.title} />
                  ) : (
                    <div className="no-poster">No Image</div>
                  )}
                </div>
                <div className="movie-details">
                  <h3 className="movie-title">{movie.title}</h3>
                  <div className="movie-meta">
                    <span className="movie-date">{formatDate(movie.scheduled_at)}</span>
                    <span className="movie-stats">
                      {parseFloat(movie.avg_rating || 0) > 0 ? (
                        <>
                          <span className="rating">{parseFloat(movie.avg_rating).toFixed(1)}</span>
                          <span className="votes">({movie.rating_count} votes)</span>
                        </>
                      ) : (
                        <span className="no-rating">No ratings</span>
                      )}
                    </span>
                  </div>
                </div>
              </Link>
              {isAdmin && (
                <button
                  className="delete-btn"
                  onClick={(e) => handleDelete(e, movie.id, movie.title)}
                  disabled={deleting === movie.id}
                  title="Delete movie"
                >
                  {deleting === movie.id ? '...' : '×'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MoviesPage;
