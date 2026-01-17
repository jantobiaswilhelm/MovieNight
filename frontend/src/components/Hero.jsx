import { Link } from 'react-router-dom';
import StarRating from './StarRating';
import './Hero.css';

const Hero = ({ movie, type = 'upcoming', compact = false }) => {
  if (!movie) return null;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const avgRating = parseFloat(movie.avg_rating) || 0;
  const isUpcoming = type === 'upcoming';

  return (
    <div className={`hero ${compact ? 'hero--compact' : ''}`}>
      {movie.image_url && (
        <div
          className="hero-backdrop"
          style={{ backgroundImage: `url(${movie.image_url})` }}
        />
      )}
      <div className="hero-content">
        <div className="hero-info">
          <span className={`hero-badge ${isUpcoming ? 'hero-badge--upcoming' : 'hero-badge--featured'}`}>
            {isUpcoming ? 'Next Movie Night' : 'Featured'}
          </span>
          <h1 className="hero-title">{movie.title}</h1>
          <p className="hero-date">{formatDate(movie.scheduled_at)}</p>

          {avgRating > 0 && (
            <div className="hero-rating">
              <StarRating rating={avgRating} size="large" />
              <span className="hero-votes">({movie.rating_count} votes)</span>
            </div>
          )}

          {movie.announced_by_name && (
            <p className="hero-announcer">Picked by {movie.announced_by_name}</p>
          )}

          <Link to={`/movie/${movie.id}`} className="hero-button">
            {isUpcoming ? 'View Details' : 'Rate Now'}
          </Link>
        </div>

        {movie.image_url && (
          <div className="hero-poster">
            <img src={movie.image_url} alt={movie.title} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Hero;
