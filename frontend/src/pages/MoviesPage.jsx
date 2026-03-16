import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovies, deleteMovie } from '../api/client';
import { useFetch } from '../hooks';
import { formatDate, formatMonth, formatMonthYear } from '../utils/helpers';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [deleting, setDeleting] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const { data: movies, loading, error, setData: setMovies } = useFetch(
    () => getMovies(500, 0),
    [],
    { initialData: [] }
  );

  const handleDelete = useCallback(async (e, movieId, movieTitle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${movieTitle}"? This will also delete all ratings.`)) {
      return;
    }

    setDeleting(movieId);
    try {
      await deleteMovie(movieId);
      setMovies((prev) => prev.filter(m => m.id !== movieId));
    } catch (err) {
      alert('Failed to delete movie: ' + err.message);
    } finally {
      setDeleting(null);
    }
  }, [setMovies]);

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

  const availableGenres = useMemo(() => {
    const genres = new Set();
    movies.forEach((movie) => {
      if (movie.genres) {
        movie.genres.split(',').forEach((g) => {
          const trimmed = g.trim();
          if (trimmed) genres.add(trimmed);
        });
      }
    });
    return Array.from(genres).sort();
  }, [movies]);

  const { availableYears, availableDecades } = useMemo(() => {
    const years = new Set();
    const decades = new Set();
    movies.forEach((movie) => {
      if (movie.release_year) {
        years.add(movie.release_year);
        decades.add(Math.floor(movie.release_year / 10) * 10);
      }
    });
    return {
      availableYears: Array.from(years).sort((a, b) => b - a),
      availableDecades: Array.from(decades).sort((a, b) => b - a),
    };
  }, [movies]);

  const hasActiveFilters = searchQuery.trim() || selectedMonth || selectedGenre || selectedYear;

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedMonth('');
    setSelectedGenre('');
    setSelectedYear('');
  }, []);

  const filteredAndSortedMovies = useMemo(() => {
    let result = [...movies];

    // Filter by search query (matches title and genres)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(query) ||
        (movie.genres && movie.genres.toLowerCase().includes(query))
      );
    }

    // Filter by genre
    if (selectedGenre) {
      result = result.filter((movie) => {
        if (!movie.genres) return false;
        const movieGenres = movie.genres.split(',').map((g) => g.trim());
        return movieGenres.includes(selectedGenre);
      });
    }

    // Filter by year or decade
    if (selectedYear) {
      if (selectedYear.endsWith('s')) {
        const decade = parseInt(selectedYear);
        result = result.filter((movie) =>
          movie.release_year >= decade && movie.release_year < decade + 10
        );
      } else {
        result = result.filter((movie) =>
          movie.release_year === parseInt(selectedYear)
        );
      }
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
  }, [movies, searchQuery, selectedGenre, selectedYear, selectedMonth, sortBy]);

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const getMoviesForDate = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    return movies.filter(movie => {
      const movieDate = new Date(movie.scheduled_at);
      return movieDate.getFullYear() === year &&
             movieDate.getMonth() === month &&
             movieDate.getDate() === day;
    });
  };

  const previousMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCalendarDate(new Date());
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getFullYear() === calendarDate.getFullYear() &&
           today.getMonth() === calendarDate.getMonth() &&
           today.getDate() === day;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarDate);
    const firstDay = getFirstDayOfMonth(calendarDate);
    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayMovies = getMoviesForDate(day);
      const hasMovies = dayMovies.length > 0;

      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday(day) ? 'today' : ''} ${hasMovies ? 'has-movies' : ''}`}
        >
          <span className="day-number">{day}</span>
          {dayMovies.map(movie => (
            <Link
              key={movie.id}
              to={`/movie/${movie.id}`}
              className="calendar-movie"
            >
              {movie.image_url && (
                <img src={movie.image_url} alt={movie.title} className="calendar-movie-thumb" loading="lazy" />
              )}
              <span className="calendar-movie-title">{movie.title}</span>
            </Link>
          ))}
        </div>
      );
    }

    return days;
  };

  if (loading) {
    return <div className="loading">Loading movies...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="movies-page">
      <div className="movies-header">
        <h1>All Movies</h1>
        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
          <button
            className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          <div className="filters-bar">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by title or genre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  &times;
                </button>
              )}
            </div>

            <div className="filter-group">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="filter-select"
              >
                <option value="">All Genres</option>
                {availableGenres.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="filter-select"
              >
                <option value="">All Years</option>
                {availableDecades.map((decade) => (
                  <option key={`${decade}s`} value={`${decade}s`}>{decade}s</option>
                ))}
                <option disabled>───</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

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

          {hasActiveFilters && (
            <div className="active-filters">
              {selectedGenre && (
                <span className="filter-tag">
                  {selectedGenre}
                  <button onClick={() => setSelectedGenre('')}>&times;</button>
                </span>
              )}
              {selectedYear && (
                <span className="filter-tag">
                  {selectedYear.endsWith('s') ? selectedYear : selectedYear}
                  <button onClick={() => setSelectedYear('')}>&times;</button>
                </span>
              )}
              {selectedMonth && (
                <span className="filter-tag">
                  {formatMonth(selectedMonth)}
                  <button onClick={() => setSelectedMonth('')}>&times;</button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="filter-tag">
                  &ldquo;{searchQuery.trim()}&rdquo;
                  <button onClick={() => setSearchQuery('')}>&times;</button>
                </span>
              )}
              <button className="clear-all-btn" onClick={clearAllFilters}>
                Clear all
              </button>
            </div>
          )}

          <div className="results-count">
            {filteredAndSortedMovies.length} movie{filteredAndSortedMovies.length !== 1 ? 's' : ''} found
          </div>

          {filteredAndSortedMovies.length === 0 ? (
            <div className="empty-state">
              <p>No movies match your search.</p>
              {hasActiveFilters && (
                <button className="btn-secondary clear-filters-btn" onClick={clearAllFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="movies-grid">
              {filteredAndSortedMovies.map((movie) => (
                <div key={movie.id} className="movie-card-wrapper">
                  <Link to={`/movie/${movie.id}`} className="movie-card">
                    <div className="movie-poster">
                      {movie.image_url ? (
                        <img src={movie.image_url} alt={movie.title} loading="lazy" />
                      ) : (
                        <div className="no-poster">No Image</div>
                      )}
                    </div>
                    <div className="movie-details">
                      <h3 className="movie-title">{movie.title}</h3>
                      {movie.genres && (
                        <div className="movie-card-genres">
                          {movie.genres.split(',').slice(0, 2).map((genre, i) => (
                            <span key={i} className="movie-genre-tag">{genre.trim()}</span>
                          ))}
                        </div>
                      )}
                      <div className="movie-meta">
                        <span className="movie-date">
                          {movie.release_year && `${movie.release_year} · `}{formatDate(movie.scheduled_at)}
                        </span>
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
        </>
      ) : (
        <div className="calendar-view">
          <div className="calendar-controls">
            <button onClick={previousMonth} className="btn-secondary">← Prev</button>
            <button onClick={goToToday} className="btn-secondary">Today</button>
            <button onClick={nextMonth} className="btn-secondary">Next →</button>
          </div>
          <h2 className="current-month">{formatMonthYear(calendarDate)}</h2>

          <div className="calendar-grid">
            <div className="calendar-weekdays">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
            <div className="calendar-days">
              {renderCalendar()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoviesPage;
