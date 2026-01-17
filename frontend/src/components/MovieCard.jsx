import { Link } from 'react-router-dom';
import StarRating from './StarRating';
import './MovieCard.css';

const MovieCard = ({ movie, variant = 'horizontal' }) => {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const avgRating = parseFloat(movie.avg_rating) || 0;
  const isUpcoming = new Date(movie.scheduled_at) > new Date();

  if (variant === 'poster') {
    return (
      <Link to={`/movie/${movie.id}`} className="movie-card movie-card--poster">
        <div className="poster-container">
          {movie.image_url ? (
            <img src={movie.image_url} alt={movie.title} className="movie-poster" />
          ) : (
            <div className="movie-poster-placeholder">
              <span>No Image</span>
            </div>
          )}
          <div className="poster-overlay">
            <h3 className="movie-title">{movie.title}</h3>
            <p className="movie-date">{formatDate(movie.scheduled_at)}</p>
          </div>
          {avgRating > 0 && (
            <div className="rating-badge">
              <span className="rating-badge-value">{avgRating.toFixed(1)}</span>
            </div>
          )}
          {isUpcoming && (
            <div className="upcoming-badge">Upcoming</div>
          )}
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link to={`/movie/${movie.id}`} className="movie-card movie-card--compact">
        {movie.image_url && (
          <img src={movie.image_url} alt={movie.title} className="movie-poster-small" />
        )}
        <div className="movie-info-compact">
          <h3 className="movie-title">{movie.title}</h3>
          <p className="movie-date">{formatDate(movie.scheduled_at)}</p>
        </div>
        {avgRating > 0 && (
          <div className="movie-rating-compact">
            <StarRating rating={avgRating} size="small" showValue={false} />
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link to={`/movie/${movie.id}`} className="movie-card movie-card--horizontal">
      <div className="poster-container">
        {movie.image_url ? (
          <img src={movie.image_url} alt={movie.title} className="movie-poster" />
        ) : (
          <div className="movie-poster-placeholder">
            <span>No Image</span>
          </div>
        )}
        {avgRating > 0 && (
          <div className="rating-badge rating-badge--small">
            <span className="rating-badge-value">{avgRating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="movie-info">
        <h3 className="movie-title">{movie.title}</h3>
        <p className="movie-date">{formatDate(movie.scheduled_at)}</p>

        <div className="movie-rating">
          {avgRating > 0 ? (
            <StarRating rating={avgRating} size="small" showValue={false} />
          ) : (
            <span className="no-ratings">No ratings yet</span>
          )}
          {movie.rating_count > 0 && (
            <span className="rating-count">{movie.rating_count} votes</span>
          )}
        </div>

        {movie.announced_by_name && (
          <p className="movie-announcer">
            Picked by {movie.announced_by_name}
          </p>
        )}
      </div>
    </Link>
  );
};

export default MovieCard;
