import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { getMovies, deleteMovie } from '../api/client';
import { useFetch } from '../hooks';
import { formatDate, formatMonth, formatMonthYear } from '../utils/helpers';
import { Icon, PageHeader, Chip, EmptyState } from '../components/ui';
import RescheduleModal from '../components/common/RescheduleModal';
import { PosterImg } from '../components/common';
import './MoviesPage.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating-high', label: 'Highest rated' },
  { value: 'rating-low', label: 'Lowest rated' },
  { value: 'votes', label: 'Most votes' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'alpha-reverse', label: 'Z → A' }
];

const MoviesPage = () => {
  const { isAdmin, user } = useAuth();
  const { showError } = useToast();
  const confirm = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [reschedulingMovie, setReschedulingMovie] = useState(null);
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

    if (!(await confirm({ title: 'Delete movie?', message: `Delete "${movieTitle}"? This also deletes all its ratings.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    setDeleting(movieId);
    try {
      await deleteMovie(movieId);
      setMovies((prev) => prev.filter(m => m.id !== movieId));
    } catch (err) {
      showError('Failed to delete movie: ' + err.message);
    } finally {
      setDeleting(null);
    }
  }, [setMovies, confirm, showError]);

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

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(query) ||
        (movie.genres && movie.genres.toLowerCase().includes(query))
      );
    }

    if (selectedGenre) {
      result = result.filter((movie) => {
        if (!movie.genres) return false;
        const movieGenres = movie.genres.split(',').map((g) => g.trim());
        return movieGenres.includes(selectedGenre);
      });
    }

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

    if (selectedMonth) {
      result = result.filter((movie) => {
        if (!movie.scheduled_at) return false;
        const date = new Date(movie.scheduled_at);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === selectedMonth;
      });
    }

    switch (sortBy) {
      case 'newest':        result.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)); break;
      case 'oldest':        result.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)); break;
      case 'rating-high':   result.sort((a, b) => parseFloat(b.avg_rating || 0) - parseFloat(a.avg_rating || 0)); break;
      case 'rating-low':    result.sort((a, b) => parseFloat(a.avg_rating || 0) - parseFloat(b.avg_rating || 0)); break;
      case 'votes':         result.sort((a, b) => parseInt(b.rating_count || 0) - parseInt(a.rating_count || 0)); break;
      case 'alpha':         result.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'alpha-reverse': result.sort((a, b) => b.title.localeCompare(a.title)); break;
      default: break;
    }

    return result;
  }, [movies, searchQuery, selectedGenre, selectedYear, selectedMonth, sortBy]);

  // Calendar helpers
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const getMoviesForDate = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    return movies.filter(movie => {
      // Collapsed rewatches carry every screening date, so the film shows on each one.
      const dates = movie.screenings?.length
        ? movie.screenings.map(s => s.scheduled_at)
        : [movie.scheduled_at];
      return dates.some(dt => {
        const d = new Date(dt);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      });
    });
  };

  const previousMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1));
  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1));
  const goToToday = () => setCalendarDate(new Date());

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

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

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
            <Link key={movie.id} to={`/movie/${movie.id}`} className="calendar-movie">
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

  if (loading) return <div className="loading">Loading…</div>;
  if (error)   return <div className="error">Error: {error}</div>;

  return (
    <div className="movies-page">
      <PageHeader
        eyebrow={`${movies.length} titles in the archive`}
        title={<>The <em>archive.</em></>}
        actions={
          <div className="view-toggle">
            <button
              className={`vt-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" size={14} /> <span>List</span>
            </button>
            <button
              className={`vt-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              <Icon name="calendar" size={14} /> <span>Calendar</span>
            </button>
          </div>
        }
      />

      {viewMode === 'list' ? (
        <>
          <div className="filters-bar">
            <div className="filter-search">
              <span className="filter-search-icon"><Icon name="search" size={16} /></span>
              <input
                type="text"
                placeholder="Title, director, genre…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-search-input"
              />
              {searchQuery && (
                <button
                  className="filter-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <div className="filter-selects">
              <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}>
                <option value="">All genres</option>
                {availableGenres.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>

              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                <option value="">All years</option>
                {availableDecades.map((decade) => (
                  <option key={`${decade}s`} value={`${decade}s`}>{decade}s</option>
                ))}
                <option disabled>───</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                <option value="">All months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="active-filters">
              {selectedGenre && (
                <Chip variant="accent" onClick={() => setSelectedGenre('')} style={{ cursor: 'pointer' }}>
                  {selectedGenre} <Icon name="close" size={11} />
                </Chip>
              )}
              {selectedYear && (
                <Chip variant="accent" onClick={() => setSelectedYear('')} style={{ cursor: 'pointer' }}>
                  {selectedYear} <Icon name="close" size={11} />
                </Chip>
              )}
              {selectedMonth && (
                <Chip variant="accent" onClick={() => setSelectedMonth('')} style={{ cursor: 'pointer' }}>
                  {formatMonth(selectedMonth)} <Icon name="close" size={11} />
                </Chip>
              )}
              {searchQuery.trim() && (
                <Chip variant="accent" onClick={() => setSearchQuery('')} style={{ cursor: 'pointer' }}>
                  &ldquo;{searchQuery.trim()}&rdquo; <Icon name="close" size={11} />
                </Chip>
              )}
              <button className="btn text sm" onClick={clearAllFilters}>Clear all</button>
            </div>
          )}

          <div className="results-count">
            {filteredAndSortedMovies.length} title{filteredAndSortedMovies.length !== 1 ? 's' : ''}
          </div>

          {filteredAndSortedMovies.length === 0 ? (
            <EmptyState
              icon={<Icon name="search" size={32} stroke={1.25} />}
              title="Nothing matches."
              body="Try clearing filters or using a shorter search."
              action={hasActiveFilters && (
                <button className="btn ghost" onClick={clearAllFilters}>Clear all filters</button>
              )}
            />
          ) : (
            <div className="movies-grid">
              {filteredAndSortedMovies.map((movie) => (
                <div key={movie.id} className="mg-wrapper">
                  <Link to={`/movie/${movie.id}`} className="mg-card">
                    <div className="mg-poster">
                      {movie.image_url ? (
                        <PosterImg src={movie.image_url} alt={movie.title} />
                      ) : (
                        <div className="mg-poster-placeholder">
                          {movie.title?.charAt(0) ?? '?'}
                        </div>
                      )}
                      {parseFloat(movie.avg_rating || 0) > 0 && (
                        <span className="mg-rating">{parseFloat(movie.avg_rating).toFixed(1)}</span>
                      )}
                    </div>
                    <div className="mg-body">
                      <h3 className="mg-title">{movie.title}</h3>
                      <div className="mg-meta">
                        {movie.release_year && <span>{movie.release_year}</span>}
                        {movie.release_year && movie.scheduled_at && <span className="sep" />}
                        {movie.scheduled_at && <span>{formatDate(movie.scheduled_at)}</span>}
                        {/* No leading separator: when the line wraps it would
                            dangle at the end of the date row. */}
                        {movie.screening_count > 1 && (
                          <span className="mg-rewatch">Watched {movie.screening_count}×</span>
                        )}
                      </div>
                      {movie.genres && (
                        <div className="mg-chips">
                          {movie.genres.split(',').slice(0, 2).map((genre, i) => (
                            <Chip key={i}>{genre.trim()}</Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                  {isAdmin && (
                    <button
                      className="mg-delete"
                      onClick={(e) => handleDelete(e, movie.id, movie.title)}
                      disabled={deleting === movie.id}
                      aria-label={`Delete ${movie.title}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                  {new Date(movie.scheduled_at) > new Date() && !movie.started_at &&
                    (isAdmin || (user && movie.announced_by === user.id)) && (
                    <button
                      className="mg-reschedule"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReschedulingMovie(movie); }}
                      aria-label={`Reschedule ${movie.title}`}
                    >
                      <Icon name="calendar" size={14} />
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
            <button onClick={previousMonth} className="btn ghost sm">
              <Icon name="chevron-left" size={14} /> <span>Prev</span>
            </button>
            <h2 className="current-month">{formatMonthYear(calendarDate)}</h2>
            <div className="cc-right">
              <button onClick={goToToday} className="btn ghost sm">Today</button>
              <button onClick={nextMonth} className="btn ghost sm">
                <span>Next</span> <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>

          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="calendar-days">{renderCalendar()}</div>
          </div>
        </div>
      )}

      {reschedulingMovie && (
        <RescheduleModal
          movie={reschedulingMovie}
          isOpen
          onClose={() => setReschedulingMovie(null)}
          onRescheduled={(updated) =>
            setMovies((prev) => prev.map((m) => (m.id === updated.id ? { ...m, scheduled_at: updated.scheduled_at } : m)))
          }
        />
      )}
    </div>
  );
};

export default MoviesPage;
