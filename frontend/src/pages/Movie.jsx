import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovie, submitRating, getMyRating, deleteMovie, getSimilarMovies, toggleAttendance } from '../api/client';
import RatingInput from '../components/RatingInput';
import StarRating from '../components/StarRating';
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
  const [similarMovies, setSimilarMovies] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [ratingsAvailable, setRatingsAvailable] = useState(false);
  const [timeUntilRatings, setTimeUntilRatings] = useState(null);

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

  // Fetch similar movies when movie data is available
  useEffect(() => {
    const fetchSimilar = async () => {
      if (!movie?.tmdb_id) return;

      setLoadingSimilar(true);
      try {
        const similar = await getSimilarMovies(movie.tmdb_id);
        setSimilarMovies(similar);
      } catch (err) {
        console.error('Failed to fetch similar movies:', err);
      } finally {
        setLoadingSimilar(false);
      }
    };

    fetchSimilar();
  }, [movie?.tmdb_id]);

  // Check if ratings are available (runtime - 10 minutes after start)
  useEffect(() => {
    if (!movie?.started_at) {
      setRatingsAvailable(false);
      setTimeUntilRatings(null);
      return;
    }

    const checkRatingsAvailability = () => {
      const startTime = new Date(movie.started_at).getTime();
      const runtime = movie.runtime || 90; // Default to 90 minutes if no runtime
      const ratingDelayMinutes = Math.max(runtime - 10, 0); // Show ratings 10 min before end
      const ratingsAvailableAt = startTime + (ratingDelayMinutes * 60 * 1000);
      const now = Date.now();

      if (now >= ratingsAvailableAt) {
        setRatingsAvailable(true);
        setTimeUntilRatings(null);
        return true;
      } else {
        setRatingsAvailable(false);
        const remainingMs = ratingsAvailableAt - now;
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
        setTimeUntilRatings(remainingMinutes);
        return false;
      }
    };

    // Check immediately
    const isAvailable = checkRatingsAvailability();

    // If not yet available, set up interval to check periodically
    if (!isAvailable) {
      const interval = setInterval(() => {
        if (checkRatingsAvailability()) {
          clearInterval(interval);
        }
      }, 300000); // Check every 5 minutes

      return () => clearInterval(interval);
    }
  }, [movie?.started_at, movie?.runtime]);

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

  const handleToggleAttendance = async () => {
    if (!isAuthenticated) return;

    setTogglingAttendance(true);
    try {
      const result = await toggleAttendance(id);
      setMovie(prev => ({
        ...prev,
        attendees: result.attendees,
        is_attending: result.attending
      }));
    } catch (err) {
      console.error('Error toggling attendance:', err);
    } finally {
      setTogglingAttendance(false);
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

  const formatRuntime = (minutes) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getLanguageName = (code) => {
    const languages = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      ja: 'Japanese', ko: 'Korean', zh: 'Chinese', pt: 'Portuguese', ru: 'Russian',
      hi: 'Hindi', ar: 'Arabic', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian',
      da: 'Danish', fi: 'Finnish', pl: 'Polish', tr: 'Turkish', th: 'Thai'
    };
    return languages[code] || code?.toUpperCase();
  };

  return (
    <div className="movie-page">
      {/* Hero Section with Backdrop */}
      {movie.backdrop_url && (
        <div className="movie-hero" style={{ backgroundImage: `url(${movie.backdrop_url})` }}>
          <div className="movie-hero-overlay" />
        </div>
      )}

      <Link to="/movies" className="back-link">&larr; Back to Movies</Link>

      <div className="movie-header">
        {movie.image_url && (
          <img src={movie.image_url} alt={movie.title} className="movie-poster-large" />
        )}

        <div className="movie-details">
          <h1>{movie.title}</h1>

          {movie.tagline && (
            <p className="movie-tagline">"{movie.tagline}"</p>
          )}

          <div className="movie-meta-info">
            {movie.release_year && (
              <span className="meta-item">{movie.release_year}</span>
            )}
            {movie.runtime && (
              <span className="meta-item">{formatRuntime(movie.runtime)}</span>
            )}
            {movie.original_language && (
              <span className="meta-item">{getLanguageName(movie.original_language)}</span>
            )}
          </div>

          {movie.genres && (
            <div className="movie-genres">
              {movie.genres.split(', ').map((genre, i) => (
                <span key={i} className="genre-tag">{genre}</span>
              ))}
            </div>
          )}

          {movie.collection_name && (
            <p className="movie-collection">Part of the <strong>{movie.collection_name}</strong></p>
          )}

          <div className="movie-ratings-row">
            {movie.tmdb_rating > 0 && (
              <div className="tmdb-rating">
                <span className="tmdb-label">TMDB</span>
                <span className="tmdb-score">{parseFloat(movie.tmdb_rating).toFixed(1)}</span>
              </div>
            )}
            {movie.avg_rating > 0 && (
              <div className="group-rating">
                <StarRating rating={movie.avg_rating} size="medium" />
                <span className="rating-label">{movie.rating_count} group votes</span>
              </div>
            )}
          </div>

          <div className="movie-links">
            {movie.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${movie.imdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="movie-link imdb-link"
              >
                IMDb
              </a>
            )}
            {movie.trailer_url && (
              <a
                href={movie.trailer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="movie-link trailer-link"
              >
                Watch Trailer
              </a>
            )}
          </div>

          <p className="movie-date">
            {movie.started_at ? 'Watched on' : 'Scheduled for'} {formatDate(movie.scheduled_at)}
          </p>

          {movie.announced_by_name && (
            <p className="movie-announcer">Picked by {movie.announced_by_name}</p>
          )}

          {/* Attendance Section - only for upcoming movies */}
          {!movie.started_at && (
            <div className="movie-attendance-section">
              <div className="movie-attendance-header">
                <h3>Who's Attending?</h3>
                {isAuthenticated && (
                  <button
                    className={`btn-attend ${movie.is_attending ? 'attending' : ''}`}
                    onClick={handleToggleAttendance}
                    disabled={togglingAttendance}
                  >
                    {togglingAttendance ? '...' : movie.is_attending ? '✓ Attending' : '+ Attend'}
                  </button>
                )}
              </div>
              {movie.attendees && movie.attendees.length > 0 ? (
                <div className="movie-attendees-list">
                  {movie.attendees.map((attendee) => (
                    <div key={attendee.discord_id} className="movie-attendee">
                      <img
                        src={attendee.avatar
                          ? `https://cdn.discordapp.com/avatars/${attendee.discord_id}/${attendee.avatar}.png?size=64`
                          : `https://cdn.discordapp.com/embed/avatars/${parseInt(attendee.discord_id) % 5}.png`
                        }
                        alt={attendee.username}
                        className="movie-attendee-avatar"
                      />
                      <span className="movie-attendee-name">{attendee.username}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="movie-no-attendees">No one has confirmed attendance yet.</p>
              )}
            </div>
          )}

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

      {movie.description && (
        <div className="movie-description">
          <h2>Overview</h2>
          <p>{movie.description}</p>
        </div>
      )}

      {ratingsAvailable ? (
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
            {movie.started_at ? (
              <>
                <p>The movie is still playing.</p>
                <p className="not-started-hint">
                  Ratings will be available in {timeUntilRatings} minute{timeUntilRatings !== 1 ? 's' : ''}.
                </p>
              </>
            ) : (
              <>
                <p>This movie night hasn't started yet.</p>
                <p className="not-started-hint">Ratings will be available near the end of the movie.</p>
              </>
            )}
          </div>
        </div>
      )}

      {ratingsAvailable && movie.ratings && movie.ratings.length > 0 && (
        <div className="all-ratings">
          <h2>All Ratings</h2>
          <div className="ratings-list">
            {movie.ratings.map((rating) => (
              <Link key={rating.id} to={`/user/${rating.user_id}`} className="rating-item">
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
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar Movies Section */}
      {movie.tmdb_id && (
        <div className="similar-movies-section">
          <h2>Similar Movies</h2>
          {loadingSimilar ? (
            <div className="similar-loading">Loading similar movies...</div>
          ) : similarMovies.length > 0 ? (
            <div className="similar-movies-grid">
              {similarMovies.map((similar) => (
                <div key={similar.id} className="similar-movie-card">
                  {similar.posterPath ? (
                    <img
                      src={similar.posterPath}
                      alt={similar.title}
                      className="similar-movie-poster"
                    />
                  ) : (
                    <div className="similar-movie-no-poster">No Image</div>
                  )}
                  <div className="similar-movie-info">
                    <h3 className="similar-movie-title">{similar.title}</h3>
                    {similar.year && (
                      <span className="similar-movie-year">{similar.year}</span>
                    )}
                    <div className="similar-movie-links">
                      {similar.imdbId && (
                        <a
                          href={`https://www.imdb.com/title/${similar.imdbId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="similar-link imdb"
                        >
                          IMDb
                        </a>
                      )}
                      {similar.trailerUrl && (
                        <a
                          href={similar.trailerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="similar-link trailer"
                        >
                          Trailer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="similar-empty">No similar movies found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Movie;
