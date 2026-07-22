import { useState } from 'react';
import { searchTMDB, getTMDBMovie } from '../../api/client';
import { Icon } from '../ui';

/**
 * Announce — search & pick a movie. Scheduling happens in the full-width
 * ScheduleSection (rendered by Home once a movie is picked).
 * Controlled: `onPick(movie|null)` reports the selection; `pickedMovie` reflects it.
 */
const AnnounceFlow = ({ onPick, pickedMovie }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

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
      onPick && onPick(details);
    } catch {
      setError('Failed to load movie details');
    } finally {
      setSearching(false);
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

      {pickedMovie ? (
        <div className="af-flow-body af-picked">
          {pickedMovie.posterPath
            ? <img src={pickedMovie.posterPath} alt="" className="af-picked-poster" loading="lazy" />
            : <div className="af-picked-check"><Icon name="check" size={22} /></div>}
          <div className="af-picked-title">{pickedMovie.title}</div>
          <div className="af-picked-sub"><Icon name="chevron" size={14} /> Pick a date on the calendar below</div>
          <button type="button" className="btn ghost sm" onClick={() => onPick(null)}>Choose a different movie</button>
        </div>
      ) : (
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
              <p>Search TMDB for any film — you&rsquo;ll set the date next.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnnounceFlow;
