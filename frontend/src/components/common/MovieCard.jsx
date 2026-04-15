import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatDate, getAvatarUrl } from '../../utils/helpers';
import { Chip } from '../ui';
import './MovieCard.css';

const MovieCard = memo(({ movie, variant = 'horizontal', attendees = null }) => {
  const { isAdmin } = useAuth();
  const avgRating = parseFloat(movie.avg_rating) || 0;
  const isUpcoming = new Date(movie.scheduled_at) > new Date();
  const showTest = isAdmin && movie.is_test;

  /* ── POSTER variant ── */
  if (variant === 'poster') {
    return (
      <Link to={`/movie/${movie.id}`} className="mc mc-poster">
        <div className="mc-poster-wrap">
          {movie.image_url ? (
            <img src={movie.image_url} alt={movie.title} className="mc-img" loading="lazy" />
          ) : (
            <div className="mc-img mc-img-placeholder">
              <span>{movie.title?.charAt(0) ?? '?'}</span>
            </div>
          )}
          {avgRating > 0 && <span className="mc-rating">{avgRating.toFixed(1)}</span>}
          {isUpcoming && <span className="mc-flag">Upcoming</span>}
          {showTest && <span className="mc-flag mc-flag-test">Test</span>}
          <div className="mc-poster-overlay">
            <h3 className="mc-title">{movie.title}</h3>
            <p className="mc-date">{formatDate(movie.scheduled_at)}</p>
          </div>
        </div>
      </Link>
    );
  }

  /* ── COMPACT variant ── */
  if (variant === 'compact') {
    const movieAttendees = attendees || movie.attendees;
    return (
      <Link to={`/movie/${movie.id}`} className="mc mc-compact">
        <div className="mc-compact-poster">
          {movie.image_url ? (
            <img src={movie.image_url} alt={movie.title} loading="lazy" />
          ) : (
            <span className="mc-compact-placeholder">
              {movie.title?.charAt(0) ?? '?'}
            </span>
          )}
          {avgRating > 0 && <span className="mc-rating">{avgRating.toFixed(1)}</span>}
        </div>
        <div className="mc-compact-body">
          {showTest && <Chip variant="accent">Test</Chip>}
          <h3 className="mc-title">{movie.title}</h3>
          <p className="mc-date">{formatDate(movie.scheduled_at)}</p>
          {movieAttendees && movieAttendees.length > 0 && (
            <div className="mc-compact-attendees">
              {movieAttendees.slice(0, 4).map((attendee) => (
                <img
                  key={attendee.discord_id}
                  src={getAvatarUrl(attendee.discord_id, attendee.avatar)}
                  alt={attendee.username}
                  title={attendee.username}
                  className="mc-compact-avatar"
                  loading="lazy"
                />
              ))}
              {movieAttendees.length > 4 && (
                <span className="mc-compact-avatar-more">+{movieAttendees.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </Link>
    );
  }

  /* ── HORIZONTAL (default) variant ── */
  return (
    <Link to={`/movie/${movie.id}`} className="mc mc-horizontal">
      <div className="mc-h-poster">
        {movie.image_url ? (
          <img src={movie.image_url} alt={movie.title} loading="lazy" />
        ) : (
          <span className="mc-compact-placeholder">
            {movie.title?.charAt(0) ?? '?'}
          </span>
        )}
        {avgRating > 0 && <span className="mc-rating">{avgRating.toFixed(1)}</span>}
      </div>

      <div className="mc-h-body">
        {showTest && <Chip variant="accent">Test</Chip>}
        <h3 className="mc-title">{movie.title}</h3>
        <p className="mc-date">{formatDate(movie.scheduled_at)}</p>

        <div className="mc-h-rating-row">
          {avgRating > 0 ? (
            <span className="mc-h-score">
              {avgRating.toFixed(1)}<sub>/10</sub>
            </span>
          ) : (
            <span className="mc-h-no-rating">Unrated</span>
          )}
          {movie.rating_count > 0 && (
            <span className="mc-h-count">· {movie.rating_count} vote{movie.rating_count !== 1 ? 's' : ''}</span>
          )}
        </div>

        {movie.announced_by_name && (
          <p className="mc-h-pickedby">Picked by {movie.announced_by_name}</p>
        )}
      </div>
    </Link>
  );
});

export default MovieCard;
