import { useState } from 'react';
import { searchTMDB, getTMDBMovie, announceMovie } from '../../api/client';

const AnnounceFlow = ({ onAnnounced }) => {
  const [announceStep, setAnnounceStep] = useState('button');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('20:00');
  const [announcing, setAnnouncing] = useState(false);
  const [error, setError] = useState(null);
  const [announcedTitle, setAnnouncedTitle] = useState('');

  const resetState = () => {
    setAnnounceStep('button');
    setSelectedMovie(null);
    setSearch('');
    setResults([]);
    setDate(new Date().toISOString().split('T')[0]);
    setTime('20:00');
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
    } catch (err) {
      console.error('Error searching movies:', err);
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
      setAnnounceStep('preview');
    } catch (err) {
      console.error('Error fetching movie details:', err);
      setError('Failed to load movie details');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMovie || !date || !time) {
      setError('Please select a date and time');
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }

    setAnnouncing(true);
    setError(null);
    try {
      await announceMovie(selectedMovie, scheduledAt.toISOString());
      setAnnouncedTitle(selectedMovie.title);
      setAnnounceStep('success');
      if (onAnnounced) onAnnounced();
      setTimeout(resetState, 3000);
    } catch (err) {
      console.error('Error announcing movie:', err);
      setError(err.message || 'Failed to announce movie');
    } finally {
      setAnnouncing(false);
    }
  };

  return (
    <section className="announce-section-fullwidth">
      {announceStep === 'button' && (
        <button
          className="btn-primary announce-main-btn"
          onClick={() => setAnnounceStep('search')}
        >
          + Announce New Movie Night
        </button>
      )}

      {announceStep === 'search' && (
        <div className="announce-flow">
          <div className="announce-flow-header">
            <h3>Announce New Movie Night</h3>
            <button className="btn-text" onClick={resetState}>Cancel</button>
          </div>
          <form onSubmit={handleSearch} className="announce-search-form">
            <input
              type="text"
              placeholder="Search for a movie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          {error && <div className="announce-error">{error}</div>}
          {results.length > 0 && (
            <div className="announce-results">
              {results.slice(0, 8).map((movie) => (
                <div
                  key={movie.id}
                  className="announce-result-item"
                  onClick={() => handleSelectMovie(movie)}
                >
                  {movie.posterPath ? (
                    <img src={movie.posterPath} alt={movie.title} className="announce-result-poster" loading="lazy" />
                  ) : (
                    <div className="announce-result-poster no-poster">No Image</div>
                  )}
                  <div className="announce-result-info">
                    <span className="announce-result-title">{movie.title}</span>
                    <span className="announce-result-year">{movie.year}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {announceStep === 'preview' && selectedMovie && (
        <div className="announce-flow">
          <div className="announce-flow-header">
            <h3>Announce New Movie Night</h3>
            <button className="btn-text" onClick={resetState}>Cancel</button>
          </div>
          <div className="announce-preview">
            <div className="announce-preview-content">
              {selectedMovie.posterPath && (
                <img src={selectedMovie.posterPath} alt={selectedMovie.title} className="announce-preview-poster" loading="lazy" />
              )}
              <div className="announce-preview-info">
                <h4>{selectedMovie.title}</h4>
                <div className="announce-preview-meta">
                  {selectedMovie.year && <span>{selectedMovie.year}</span>}
                  {selectedMovie.runtime && <span>{Math.floor(selectedMovie.runtime / 60)}h {selectedMovie.runtime % 60}m</span>}
                  {selectedMovie.rating && <span>TMDB {selectedMovie.rating}</span>}
                </div>
                {selectedMovie.genres && (
                  <div className="announce-preview-genres">
                    {selectedMovie.genres.split(', ').slice(0, 4).map((genre, i) => (
                      <span key={i} className="genre-tag">{genre}</span>
                    ))}
                  </div>
                )}
                {selectedMovie.overview && (
                  <p className="announce-preview-description">{selectedMovie.overview}</p>
                )}
              </div>
            </div>
            <div className="announce-preview-actions">
              <button className="btn-secondary" onClick={() => setAnnounceStep('search')}>
                Choose Different
              </button>
              <button className="btn-primary" onClick={() => setAnnounceStep('schedule')}>
                Schedule This Movie
              </button>
            </div>
          </div>
        </div>
      )}

      {announceStep === 'schedule' && selectedMovie && (
        <div className="announce-flow">
          <div className="announce-flow-header">
            <h3>Schedule Movie Night</h3>
            <button className="btn-text" onClick={resetState}>Cancel</button>
          </div>
          <div className="announce-schedule">
            <div className="announce-schedule-movie">
              {selectedMovie.posterPath && (
                <img src={selectedMovie.posterPath} alt={selectedMovie.title} className="announce-schedule-poster" loading="lazy" />
              )}
              <span className="announce-schedule-title">{selectedMovie.title}</span>
            </div>
            <form onSubmit={handleSubmit} className="announce-schedule-form">
              <div className="announce-schedule-fields">
                <div className="announce-field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div className="announce-field">
                  <label>Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              {error && <div className="announce-error">{error}</div>}
              <div className="announce-schedule-actions">
                <button type="button" className="btn-secondary" onClick={() => setAnnounceStep('preview')}>
                  Back
                </button>
                <button type="submit" className="btn-primary" disabled={announcing}>
                  {announcing ? 'Scheduling...' : 'Announce Movie Night'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {announceStep === 'success' && (
        <div className="announce-success">
          <div className="announce-success-icon">{'\u2713'}</div>
          <h3>Movie Night Announced!</h3>
          <p><strong>{announcedTitle}</strong> has been scheduled.</p>
        </div>
      )}
    </section>
  );
};

export default AnnounceFlow;
