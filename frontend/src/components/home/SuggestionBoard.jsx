import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { getAvatarUrl } from '../../utils/helpers';
import {
  getBoard, addSuggestion, setSuggestionVote, clearSuggestionVote,
  announceSuggestion, deleteSuggestion, searchTMDB, getTMDBMovie
} from '../../api/client';
import { Icon } from '../ui';

/** Format a Date as YYYY-MM-DD in the browser's local timezone (never UTC). */
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Always-on suggestion board. Fetches its own data. Lives in the Home sidebar.
 * Calls `onAnnounced()` after a successful announce so the parent can refresh
 * its movie data (hero, calendar).
 */
const SuggestionBoard = ({ onAnnounced }) => {
  const { isAuthenticated, isAdmin, user, login } = useAuth();
  const { showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Suggest modal
  const [showSuggest, setShowSuggest] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Announce modal
  const [announceFor, setAnnounceFor] = useState(null); // suggestion object
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7)); // next Friday
    return localDateStr(d);
  });
  const [time, setTime] = useState('20:30');
  const [announcing, setAnnouncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getBoard();
      setBoard(data);
    } catch (err) {
      console.error('Error loading board:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleVote = async (s, dir) => {
    if (!isAuthenticated || busyId) return;
    setBusyId(s.id);
    try {
      if (s.user_vote === dir) await clearSuggestionVote(s.id);
      else await setSuggestionVote(s.id, dir);
      await refresh();
    } catch (err) {
      showError('Failed to vote');
    } finally {
      setBusyId(null);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      setResults(await searchTMDB(search));
    } catch {
      showError('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (movie) => {
    setAddingId(movie.id);
    try {
      const d = await getTMDBMovie(movie.id);
      await addSuggestion(d.title, d.posterPath, {
        description: d.overview, tmdbId: d.id, tmdbRating: d.rating,
        genres: d.genres, runtime: d.runtime, releaseYear: d.year,
        backdropUrl: d.backdropPath, tagline: d.tagline, imdbId: d.imdbId,
        originalLanguage: d.originalLanguage, collectionName: d.collectionName,
        trailerUrl: d.trailerUrl
      });
      setShowSuggest(false);
      setSearch('');
      setResults([]);
      await refresh();
    } catch (err) {
      if (err.status === 409) showError('That movie is already on the board.');
      else showError('Failed to add movie: ' + err.message);
    } finally {
      setAddingId(null);
    }
  };

  const handleAnnounce = async (e) => {
    e.preventDefault();
    if (!announceFor) return;
    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      showError('The time must be in the future.');
      return;
    }
    setAnnouncing(true);
    try {
      await announceSuggestion(announceFor.id, scheduledAt.toISOString());
      showSuccess(`${announceFor.title} is on the calendar.`);
      setAnnounceFor(null);
      await refresh();
      if (onAnnounced) onAnnounced();
    } catch (err) {
      if (err.status === 409) showError('That suggestion is already scheduled.');
      else showError('Failed to announce: ' + err.message);
    } finally {
      setAnnouncing(false);
    }
  };

  const handleDelete = async (s) => {
    if (!(await confirm({
      title: 'Remove suggestion?',
      message: `Remove "${s.title}" from the board?`,
      confirmLabel: 'Remove',
      danger: true
    }))) return;
    setBusyId(s.id);
    try {
      await deleteSuggestion(s.id);
      await refresh();
    } catch (err) {
      showError('Failed to remove: ' + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const closeAnnounce = () => {
    setAnnounceFor(null);
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7)); // next Friday
    setDate(localDateStr(d));
    setTime('20:30');
  };

  const canRemove = (s) => isAdmin || (user && s.suggested_by === user.id);

  return (
    <div className="sb">
      <header className="sb-head">
        <div>
          <div className="sb-eyebrow">The board</div>
          <h3 className="sb-title">Suggest a movie</h3>
        </div>
        {isAuthenticated && (
          <button className="btn sm" onClick={() => setShowSuggest(true)}>
            <Icon name="plus" size={14} /> <span>Suggest</span>
          </button>
        )}
      </header>

      {loading ? (
        <div className="sb-empty"><p>Loading…</p></div>
      ) : board.length === 0 ? (
        <div className="sb-empty">
          <Icon name="film" size={24} stroke={1.25} />
          <p>No suggestions yet.</p>
          {isAuthenticated
            ? <small>Be the first — hit Suggest.</small>
            : <small>Log in to suggest and vote.</small>}
        </div>
      ) : (
        <ul className="sb-list">
          {board.map((s) => {
            const count = parseInt(s.upvote_count) || 0;
            const scheduled = s.status === 'scheduled';
            return (
              <li key={s.id} className={`sb-item ${scheduled ? 'scheduled' : ''}`}>
                {s.image_url ? (
                  <img src={s.image_url} alt="" className="sb-poster" loading="lazy" />
                ) : (
                  <div className="sb-poster no-poster"><Icon name="film" size={16} /></div>
                )}
                <div className="sb-info">
                  <span className="sb-item-title">{s.title}</span>
                  {s.suggested_by_name && (
                    <span className="sb-by">
                      <img
                        src={getAvatarUrl(s.suggested_by_discord_id, s.suggested_by_avatar)}
                        alt=""
                        className="sb-by-avatar"
                        loading="lazy"
                      />
                      by {s.suggested_by_name}
                    </span>
                  )}
                  {scheduled ? (
                    <span className="sb-scheduled">
                      <Icon name="calendar" size={12} /> Scheduled ·{' '}
                      {new Date(s.scheduled_at).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric'
                      })}
                    </span>
                  ) : (
                    <div className="sb-upvoters">
                      {(s.upvoters || []).slice(0, 4).map((v) => (
                        <img
                          key={v.discord_id}
                          src={getAvatarUrl(v.discord_id, v.avatar)}
                          alt={v.username}
                          title={v.username}
                          className="sb-upvoter-avatar"
                          loading="lazy"
                        />
                      ))}
                      {count > 4 && <span className="sb-upvoter-more">+{count - 4}</span>}
                    </div>
                  )}
                </div>

                <div className="sb-actions">
                  <div className="sb-vote">
                    <button
                      className={`sb-vote-btn up ${s.user_vote === 1 ? 'on' : ''}`}
                      onClick={() => handleVote(s, 1)}
                      disabled={!isAuthenticated || busyId !== null || scheduled}
                      title={isAuthenticated ? 'Upvote' : 'Log in to vote'}
                    >
                      <Icon name="chevron-up" size={14} />
                      <span>{parseInt(s.upvote_count) || 0}</span>
                    </button>
                    <button
                      className={`sb-vote-btn down ${s.user_vote === -1 ? 'on' : ''}`}
                      onClick={() => handleVote(s, -1)}
                      disabled={!isAuthenticated || busyId !== null || scheduled}
                      title={isAuthenticated ? 'Downvote' : 'Log in to vote'}
                    >
                      <Icon name="chevron-down" size={14} />
                      <span>{parseInt(s.downvote_count) || 0}</span>
                    </button>
                  </div>
                  {!scheduled && isAuthenticated && (
                    <button
                      className="sb-announce"
                      onClick={() => setAnnounceFor(s)}
                      title="Announce to movie night"
                    >
                      <Icon name="megaphone" size={14} />
                    </button>
                  )}
                  {canRemove(s) && (
                    <button
                      className="sb-remove"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      title="Remove"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isAuthenticated && board.length > 0 && (
        <div className="sb-login">
          <button onClick={login} className="btn sm">Log in to vote</button>
        </div>
      )}

      {/* Suggest modal */}
      {showSuggest && (
        <div className="sb-modal-overlay" onClick={() => setShowSuggest(false)}>
          <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-modal-head">
              <h2>Suggest a movie</h2>
              <button className="sb-modal-close" aria-label="Close" onClick={() => setShowSuggest(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={handleSearch} className="af-search">
              <div className="af-search-input">
                <span className="af-search-icon"><Icon name="search" size={16} /></span>
                <input
                  type="text"
                  placeholder="Title, director, year…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
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
            {results.length > 0 ? (
              <ul className="af-results">
                {results.slice(0, 10).map((movie) => (
                  <li key={movie.id} className="af-result" onClick={() => handleAdd(movie)}>
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
                    {addingId === movie.id
                      ? <span className="af-result-year">Adding…</span>
                      : <Icon name="arrow-right" size={14} className="af-result-arrow" />}
                  </li>
                ))}
              </ul>
            ) : !searching && (
              <div className="af-hint">
                <Icon name="film" size={24} stroke={1.25} />
                <p>Search TMDB for any film to add it to the board.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Announce modal */}
      {announceFor && (
        <div className="sb-modal-overlay" onClick={closeAnnounce}>
          <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-modal-head">
              <h2>Announce "{announceFor.title}"</h2>
              <button className="sb-modal-close" aria-label="Close" onClick={closeAnnounce}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={handleAnnounce} className="sb-announce-form">
              <div className="sb-when-fields">
                <label className="sb-field">
                  <span>Date</span>
                  <input type="date" value={date} min={localDateStr(new Date())}
                    onChange={(e) => setDate(e.target.value)} required />
                </label>
                <label className="sb-field">
                  <span>Time</span>
                  <input type="time" value={time}
                    onChange={(e) => setTime(e.target.value)} required />
                </label>
              </div>
              <button type="submit" className="btn lg" disabled={announcing}>
                {announcing ? 'Scheduling…' : <><Icon name="megaphone" size={16} /> <span>Announce screening</span></>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestionBoard;
