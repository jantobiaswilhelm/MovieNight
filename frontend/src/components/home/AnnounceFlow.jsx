import { useState } from 'react';
import { searchTMDB, getTMDBMovie, announceMovie } from '../../api/client';
import { Icon, Chip } from '../ui';

/** Format a Date as YYYY-MM-DD in the browser's local timezone (never UTC). */
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Inline Announce wizard — search → preview+schedule → success.
 * Designed to live in the Home hero sidebar but works anywhere.
 * Calls `onAnnounced()` on success so the parent can refetch data.
 */
const AnnounceFlow = ({ onAnnounced }) => {
  const [step, setStep] = useState('search');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(() => {
    // Default to next Friday at 20:30
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7));
    return localDateStr(d);
  });
  const [time, setTime] = useState('20:30');
  const [announcing, setAnnouncing] = useState(false);
  const [error, setError] = useState(null);
  const [announcedTitle, setAnnouncedTitle] = useState('');

  const reset = () => {
    setStep('search');
    setSelectedMovie(null);
    setSearch('');
    setResults([]);
    setError(null);
    setAnnouncedTitle('');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await searchTMDB(search);
      setResults(data);
    } catch {
      setError('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectMovie = async (movie) => {
    setSearching(true);
    setError(null);
    try {
      const details = await getTMDBMovie(movie.id);
      setSelectedMovie(details);
      setStep('preview');
    } catch {
      setError('Failed to load movie details');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMovie || !date || !time) {
      setError('Pick a date and time.');
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      setError('The time must be in the future.');
      return;
    }
    setAnnouncing(true);
    setError(null);
    try {
      await announceMovie(selectedMovie, scheduledAt.toISOString());
      setAnnouncedTitle(selectedMovie.title);
      setStep('success');
      if (onAnnounced) {
        // Give the success card a beat to render, then let the parent refresh
        setTimeout(() => onAnnounced(), 1200);
      }
      // Auto-reset after a while in case the panel is still mounted
      setTimeout(reset, 4500);
    } catch (err) {
      setError(err.message || 'Failed to announce movie');
    } finally {
      setAnnouncing(false);
    }
  };

  return (
    <div className="af-flow">
      <header className="af-flow-head">
        <div>
          <div className="af-flow-eyebrow">Host the next night</div>
          <h3 className="af-flow-title">Announce the next movie</h3>
        </div>
      </header>

      {/* ── Step: search ── */}
      {step === 'search' && (
        <div className="af-flow-body">
          <form onSubmit={handleSearch} className="af-search">
            <div className="af-search-input">
              <span className="af-search-icon"><Icon name="search" size={16} /></span>
              <input
                type="text"
                placeholder="Title, director, year…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="af-search-clear"
                  onClick={() => { setSearch(''); setResults([]); }}
                  aria-label="Clear"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            <button type="submit" className="btn sm" disabled={searching || !search.trim()}>
              {searching ? '…' : 'Search'}
            </button>
          </form>

          {error && <div className="af-error">{error}</div>}

          {results.length > 0 ? (
            <ul className="af-results">
              {results.slice(0, 10).map((movie) => (
                <li
                  key={movie.id}
                  className="af-result"
                  onClick={() => handleSelectMovie(movie)}
                >
                  {movie.posterPath ? (
                    <img src={movie.posterPath} alt="" className="af-result-poster" loading="lazy" />
                  ) : (
                    <div className="af-result-poster af-result-placeholder">
                      {movie.title?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div className="af-result-info">
                    <span className="af-result-title">{movie.title}</span>
                    {movie.year && <span className="af-result-year">{movie.year}</span>}
                  </div>
                  <Icon name="arrow-right" size={14} className="af-result-arrow" />
                </li>
              ))}
            </ul>
          ) : !searching && (
            <div className="af-hint">
              <Icon name="film" size={24} stroke={1.25} />
              <p>Search TMDB for any film — you'll set the date next.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Step: preview + schedule ── */}
      {step === 'preview' && selectedMovie && (
        <form className="af-flow-body" onSubmit={handleSubmit}>
          <button
            type="button"
            className="af-back"
            onClick={() => { setSelectedMovie(null); setStep('search'); }}
          >
            <Icon name="arrow-left" size={12} /> Choose a different one
          </button>

          <div className="af-preview">
            {selectedMovie.posterPath && (
              <img
                src={selectedMovie.posterPath}
                alt={selectedMovie.title}
                className="af-preview-poster"
                loading="lazy"
              />
            )}
            <div className="af-preview-body">
              <h4 className="af-preview-title">{selectedMovie.title}</h4>
              <div className="af-preview-meta">
                {selectedMovie.year && <span>{selectedMovie.year}</span>}
                {selectedMovie.runtime > 0 && (
                  <>
                    <span className="sep" />
                    <span>{Math.floor(selectedMovie.runtime / 60)}h {selectedMovie.runtime % 60}m</span>
                  </>
                )}
                {selectedMovie.rating > 0 && (
                  <>
                    <span className="sep" />
                    <span>TMDB {selectedMovie.rating}</span>
                  </>
                )}
              </div>
              {selectedMovie.genres && (
                <div className="af-preview-chips">
                  {selectedMovie.genres.split(', ').slice(0, 3).map((g, i) => (
                    <Chip key={i} variant={i === 0 ? 'accent' : 'default'}>{g}</Chip>
                  ))}
                </div>
              )}
              {selectedMovie.overview && (
                <p className="af-preview-desc">{selectedMovie.overview}</p>
              )}
            </div>
          </div>

          <div className="af-when">
            <div className="af-when-label">When</div>
            <div className="af-when-fields">
              <label className="af-field">
                <span>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={localDateStr(new Date())}
                  required
                />
              </label>
              <label className="af-field">
                <span>Time</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </label>
            </div>
          </div>

          {error && <div className="af-error">{error}</div>}

          <button type="submit" className="btn lg af-submit" disabled={announcing}>
            {announcing
              ? 'Scheduling…'
              : <><Icon name="megaphone" size={16} /> <span>Announce screening</span></>}
          </button>
        </form>
      )}

      {/* ── Step: success ── */}
      {step === 'success' && (
        <div className="af-flow-body af-success">
          <div className="af-success-check">
            <Icon name="check" size={28} stroke={2} />
          </div>
          <h4>It's on the calendar.</h4>
          <p><em>{announcedTitle}</em> is announced. Updating the page…</p>
        </div>
      )}
    </div>
  );
};

export default AnnounceFlow;
