import { useState } from 'react';
import { addToWishlist } from '../../api/client';
import './QuickAddToWishlist.css';

const QuickAddToWishlist = ({ movie, onClose, onSuccess }) => {
  const [importance, setImportance] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      await addToWishlist({
        tmdb_id: movie.id,
        title: movie.title,
        image_url: movie.posterPath,
        backdrop_url: movie.backdropPath,
        description: movie.overview,
        tmdb_rating: movie.rating,
        genres: movie.genres,
        runtime: movie.runtime,
        release_year: movie.year,
        importance
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="quick-add-overlay" onClick={onClose}>
      <div className="quick-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quick-add-header">
          <h3>Add to Wishlist</h3>
          <button className="quick-add-close" onClick={onClose}>&times;</button>
        </div>

        <div className="quick-add-movie">
          {movie.posterPath && (
            <img src={movie.posterPath} alt={movie.title} className="quick-add-poster" loading="lazy" />
          )}
          <div className="quick-add-info">
            <span className="quick-add-title">{movie.title}</span>
            {movie.year && <span className="quick-add-year">{movie.year}</span>}
          </div>
        </div>

        <div className="quick-add-importance">
          <label>How badly do you want to watch this?</label>
          <div className="importance-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`importance-star ${star <= importance ? 'active' : ''}`}
                onClick={() => setImportance(star)}
              >
                &#9733;
              </button>
            ))}
          </div>
          <span className="importance-label">
            {importance === 1 && 'Just curious'}
            {importance === 2 && 'Would be nice'}
            {importance === 3 && 'Want to see it'}
            {importance === 4 && 'Really want to see it'}
            {importance === 5 && 'MUST WATCH!'}
          </span>
        </div>

        {error && <div className="quick-add-error">{error}</div>}

        <div className="quick-add-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Adding...' : 'Add to Wishlist'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAddToWishlist;
