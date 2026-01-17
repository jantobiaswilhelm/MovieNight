import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovie, submitRating, getMyRating, deleteMovie } from '../api/client';
import RatingInput from '../components/RatingInput';
import './Movie.css';

const Movie = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, login } = useAuth();
  const [movie, setMovie] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ratingMessage, setRatingMessage] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const movieData = await getMovie(id);
        setMovie(movieData);

        if (isAuthenticated) {
          try {
            const rating = await getMyRating(id);
            setMyRating(rating?.score || null);
          } catch {
            // No rating yet
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isAuthenticated]);

  const handleSubmitRating = async (score) => {
    try {
      await submitRating(id, score);
      setMyRating(score);
      setRatingMessage('Rating saved!');

      // Refresh movie data
      const movieData = await getMovie(id);
      setMovie(movieData);

      setTimeout(() => setRatingMessage(null), 3000);
    } catch (err) {
      setRatingMessage(`Error: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${movie.title}"? This will also delete all ratings.`)) {
      return;
    }

    setDeleting(true);
    try {
      await deleteMovie(id);
      navigate('/movies');
    } catch (err) {
      alert('Failed to delete movie: ' + err.message);
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading movie...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!movie) {
    return <div className="error">Movie not found</div>;
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="movie-page">
      <Link to="/movies" className="back-link">&larr; Back to Movies</Link>

      <div className="movie-header">
        {movie.image_url && (
          <img src={movie.image_url} alt={movie.title} className="movie-poster-large" />
        )}

        <div className="movie-details">
          <h1>{movie.title}</h1>
          <p className="movie-date">{formatDate(movie.scheduled_at)}</p>

          {movie.announced_by_name && (
            <p className="movie-announcer">Picked by {movie.announced_by_name}</p>
          )}

          <div className="movie-stats">
            <div className="stat">
              <span className="stat-value">
                {movie.avg_rating > 0 ? movie.avg_rating.toFixed(1) : '-'}
              </span>
              <span className="stat-label">Average</span>
            </div>
            <div className="stat">
              <span className="stat-value">{movie.rating_count}</span>
              <span className="stat-label">Votes</span>
            </div>
          </div>

          {isAdmin && (
            <button
              className="btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Movie'}
            </button>
          )}
        </div>
      </div>

      {movie.started_at ? (
        <div className="rating-section">
          <h2>Your Rating</h2>
          {isAuthenticated ? (
            <>
              <RatingInput
                currentRating={myRating}
                onSubmit={handleSubmitRating}
              />
              {ratingMessage && (
                <p className={ratingMessage.startsWith('Error') ? 'error' : 'success'}>
                  {ratingMessage}
                </p>
              )}
            </>
          ) : (
            <div className="login-prompt">
              <p>Log in with Discord to rate this movie.</p>
              <button onClick={login} className="btn-primary">
                Login with Discord
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rating-section">
          <h2>Rating</h2>
          <div className="not-started-message">
            <p>This movie night hasn't started yet.</p>
            <p className="not-started-hint">Ratings will be available once the movie begins.</p>
          </div>
        </div>
      )}

      {movie.started_at && movie.ratings && movie.ratings.length > 0 && (
        <div className="all-ratings">
          <h2>All Ratings</h2>
          <div className="ratings-list">
            {movie.ratings.map((rating) => (
              <div key={rating.id} className="rating-item">
                <div className="rating-user">
                  {rating.avatar && (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${rating.discord_id}/${rating.avatar}.png`}
                      alt=""
                      className="rating-avatar"
                    />
                  )}
                  <span>{rating.username}</span>
                </div>
                <div className="rating-score">{parseFloat(rating.score).toFixed(1)}/10</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Movie;
