import { Link } from 'react-router-dom';
import './MovieCard.css';

const MovieCard = ({ movie }) => {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const avgRating = parseFloat(movie.avg_rating) || 0;

  return (
    <Link to={`/movie/${movie.id}`} className="movie-card">
      {movie.image_url ? (
        <img src={movie.image_url} alt={movie.title} className="movie-poster" />
      ) : (
        <div className="movie-poster-placeholder">
          <span>No Image</span>
        </div>
      )}

      <div className="movie-info">
        <h3 className="movie-title">{movie.title}</h3>
        <p className="movie-date">{formatDate(movie.scheduled_at)}</p>

        <div className="movie-rating">
          {avgRating > 0 ? (
            <>
              <span className="rating-value">{avgRating.toFixed(1)}</span>
              <span className="rating-max">/10</span>
              <span className="rating-count">({movie.rating_count} votes)</span>
            </>
          ) : (
            <span className="no-ratings">No ratings yet</span>
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
