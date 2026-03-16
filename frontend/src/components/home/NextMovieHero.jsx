import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../../utils/sanitizeUrl';
import { formatDate, getAvatarUrl } from '../../utils/helpers';
import { toggleAttendance } from '../../api/client';

const NextMovieHero = ({ movie, loading, onAttendanceChange }) => {
  const { isAuthenticated } = useAuth();
  const [togglingAttendance, setTogglingAttendance] = useState(false);

  const handleToggleAttendance = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || !movie) return;

    setTogglingAttendance(true);
    try {
      const result = await toggleAttendance(movie.id);
      if (onAttendanceChange) {
        onAttendanceChange({
          ...movie,
          attendees: result.attendees,
          is_attending: result.attending
        });
      }
    } catch (err) {
      console.error('Error toggling attendance:', err);
    } finally {
      setTogglingAttendance(false);
    }
  };

  if (loading) {
    return (
      <div className="hero-backdrop hero-skeleton">
        <div className="hero-content">
          <div className="skeleton hero-poster-skeleton" />
          <div className="hero-details">
            <div className="skeleton" style={{ width: '60%', height: 32 }} />
            <div className="skeleton" style={{ width: '100%', height: 16, marginTop: 12 }} />
            <div className="skeleton" style={{ width: '80%', height: 16, marginTop: 8 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="hero-backdrop hero-empty">
        <div className="hero-backdrop-overlay" />
        <div className="hero-content">
          <div className="hero-details hero-details-centered">
            <span className="hero-badge empty">No Upcoming</span>
            <h2 className="hero-title">No movie scheduled</h2>
            <p className="hero-description">Start a vote to pick the next movie!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/movie/${movie.id}`}
      className="hero-backdrop"
      style={{
        backgroundImage: sanitizeImageUrl(movie.backdrop_url)
          ? `url(${sanitizeImageUrl(movie.backdrop_url)})`
          : sanitizeImageUrl(movie.image_url)
            ? `url(${sanitizeImageUrl(movie.image_url)})`
            : 'none'
      }}
    >
      <div className="hero-backdrop-overlay" />
      <div className="hero-content">
        <div className="hero-poster-small">
          {movie.image_url ? (
            <img src={movie.image_url} alt={movie.title} className="hero-poster" loading="lazy" />
          ) : (
            <div className="hero-poster-placeholder">No Poster</div>
          )}
        </div>
        <div className="hero-details">
          <span className="hero-badge">Up Next</span>
          <h1 className="hero-title">{movie.title}</h1>
          {movie.tagline && (
            <p className="hero-tagline">"{movie.tagline}"</p>
          )}
          <div className="hero-meta">
            {movie.release_year && (
              <span className="hero-meta-item">{movie.release_year}</span>
            )}
            {movie.runtime && (
              <span className="hero-meta-item">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
            )}
            {movie.tmdb_rating > 0 && (
              <span className="hero-meta-item hero-tmdb">TMDB {parseFloat(movie.tmdb_rating).toFixed(1)}</span>
            )}
          </div>
          {movie.genres && (
            <div className="hero-genres">
              {movie.genres.split(', ').map((genre, i) => (
                <span key={i} className="hero-genre-tag">{genre}</span>
              ))}
            </div>
          )}
          {movie.description && (
            <p className="hero-description">{movie.description}</p>
          )}
          <div className="hero-footer">
            <p className="hero-date">{formatDate(movie.scheduled_at, 'long')}</p>
            {movie.announced_by_name && (
              <p className="hero-picker">Picked by {movie.announced_by_name}</p>
            )}
          </div>
          {/* Attendance Section */}
          <div className="hero-attendance">
            <div className="attendance-info">
              {movie.attendees && movie.attendees.length > 0 ? (
                <>
                  <div className="attendance-avatars">
                    {movie.attendees.slice(0, 8).map((attendee) => (
                      <img
                        key={attendee.discord_id}
                        src={getAvatarUrl(attendee.discord_id, attendee.avatar)}
                        alt={attendee.username}
                        title={attendee.username}
                        className="attendance-avatar"
                        loading="lazy"
                      />
                    ))}
                    {movie.attendees.length > 8 && (
                      <span className="attendance-overflow">+{movie.attendees.length - 8}</span>
                    )}
                  </div>
                  <span className="attendance-count">
                    {movie.attendees.length} attending
                  </span>
                </>
              ) : (
                <span className="attendance-count">No one attending yet</span>
              )}
            </div>
            {isAuthenticated && (
              <button
                className={`hero-btn ${movie.is_attending ? 'hero-btn-attending' : 'hero-btn-attend'}`}
                onClick={handleToggleAttendance}
                disabled={togglingAttendance}
              >
                {togglingAttendance ? '...' : movie.is_attending ? '\u2713 Attending' : '+ Attend'}
              </button>
            )}
          </div>
          {(movie.trailer_url || sanitizeImdbId(movie.imdb_id)) && (
            <div className="hero-actions">
              {movie.trailer_url && (
                <a
                  href={sanitizeUrl(movie.trailer_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-btn hero-btn-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  {'\u25B6'} Watch Trailer
                </a>
              )}
              {sanitizeImdbId(movie.imdb_id) && (
                <a
                  href={`https://www.imdb.com/title/${sanitizeImdbId(movie.imdb_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-btn hero-btn-secondary"
                  onClick={(e) => e.stopPropagation()}
                >
                  IMDb
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default NextMovieHero;
