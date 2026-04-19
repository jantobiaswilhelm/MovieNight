import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovie, submitRating, getMyRating, deleteMovie, getSimilarMovies, toggleAttendance, getMovieCredits } from '../api/client';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../utils/sanitizeUrl';
import { formatDate, formatRuntime, getLanguageName, getAvatarUrl } from '../utils/helpers';
import { StarRating } from '../components/common';
import { RatingInput, RatingReactions } from '../components/rating';
import { QuickAddToWishlist } from '../components/wishlist';
import { Icon, SectionHead, Chip, Badge, Eyebrow, EmptyState } from '../components/ui';
import './Movie.css';

const Movie = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, login } = useAuth();
  const [movie, setMovie] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [myComment, setMyComment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ratingMessage, setRatingMessage] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [similarMovies, setSimilarMovies] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [credits, setCredits] = useState(null);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [ratingsAvailable, setRatingsAvailable] = useState(false);
  const [timeUntilRatings, setTimeUntilRatings] = useState(null);
  const [quickAddMovie, setQuickAddMovie] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const movieData = await getMovie(id);
        setMovie(movieData);

        if (isAuthenticated) {
          try {
            const rating = await getMyRating(id);
            setMyRating(rating?.score || null);
            setMyComment(rating?.comment || null);
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

  useEffect(() => {
    const fetchSimilarAndCredits = async () => {
      if (!movie?.tmdb_id) return;

      setLoadingSimilar(true);
      try {
        const [similar, creditsData] = await Promise.all([
          getSimilarMovies(movie.tmdb_id),
          getMovieCredits(movie.tmdb_id)
        ]);
        setSimilarMovies(similar);
        setCredits(creditsData);
      } catch (err) {
        console.error('Failed to fetch similar movies or credits:', err);
      } finally {
        setLoadingSimilar(false);
      }
    };

    fetchSimilarAndCredits();
  }, [movie?.tmdb_id]);

  useEffect(() => {
    if (!movie?.started_at) {
      setRatingsAvailable(false);
      setTimeUntilRatings(null);
      return;
    }

    const checkRatingsAvailability = () => {
      const RATING_BUFFER_MINUTES = 10;
      const DEFAULT_RUNTIME_MINUTES = 90;
      const startTime = new Date(movie.started_at).getTime();
      const runtime = movie.runtime || DEFAULT_RUNTIME_MINUTES;
      const ratingDelayMinutes = Math.max(runtime - RATING_BUFFER_MINUTES, 0);
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

    const isAvailable = checkRatingsAvailability();

    if (!isAvailable) {
      const interval = setInterval(() => {
        if (checkRatingsAvailability()) {
          clearInterval(interval);
        }
      }, 300000);

      return () => clearInterval(interval);
    }
  }, [movie?.started_at, movie?.runtime]);

  const handleSubmitRating = async (score, comment) => {
    try {
      await submitRating(id, score, comment);
      setMyRating(score);
      setMyComment(comment);
      setRatingMessage('Rating saved!');
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
    return <div className="loading">Loading…</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!movie) {
    return <div className="error">Movie not found</div>;
  }

  const backdropUrl = sanitizeImageUrl(movie.backdrop_url);

  return (
    <div className="movie-page">

      {/* ── Back / breadcrumb ── */}
      <div className="movie-back">
        <Link to="/movies" className="btn text">
          <Icon name="arrow-left" size={14} stroke={1.75} /> Back to the archive
        </Link>
        {isAdmin && movie.is_test && (
          <Chip variant="accent">Test mode</Chip>
        )}
      </div>

      {/* ── Hero with backdrop ── */}
      <header className="mv-hero">
        {backdropUrl && (
          <div
            className="mv-hero-bg"
            style={{ backgroundImage: `url(${backdropUrl})` }}
            aria-hidden="true"
          />
        )}
        <div className="mv-hero-scrim" aria-hidden="true" />

        <div className="mv-hero-grid">
          {/* Poster */}
          <div className="mv-poster-wrap">
            {movie.image_url ? (
              <img src={movie.image_url} alt={movie.title} className="mv-poster" loading="lazy" />
            ) : (
              <div className="mv-poster mv-poster-placeholder">
                <span>{movie.title?.charAt(0) ?? '?'}</span>
              </div>
            )}
          </div>

          {/* Center feature */}
          <div className="mv-feature">
            <div className="mv-eyebrow">
              {movie.started_at ? 'Past screening' : 'Scheduled'} · {formatDate(movie.scheduled_at, 'long')}
            </div>

            <h1 className="mv-title">{movie.title}</h1>

            {movie.tagline && (
              <p className="mv-tagline">&ldquo;{movie.tagline}&rdquo;</p>
            )}

            <div className="mv-meta">
              {movie.release_year && <span>{movie.release_year}</span>}
              {movie.runtime && (<><span className="sep" /><span>{formatRuntime(movie.runtime)}</span></>)}
              {movie.original_language && (<><span className="sep" /><span>{getLanguageName(movie.original_language)}</span></>)}
            </div>

            {movie.genres && (
              <div className="mv-chips">
                {movie.genres.split(', ').map((genre, i) => (
                  <Chip key={i} variant={i === 0 ? 'accent' : 'default'}>{genre}</Chip>
                ))}
              </div>
            )}

            <div className="mv-scores">
              {movie.tmdb_rating > 0 && (
                <div className="mv-score">
                  <span className="mv-score-label">TMDB</span>
                  <span className="mv-score-num">{parseFloat(movie.tmdb_rating).toFixed(1)}<sub>/10</sub></span>
                </div>
              )}
              {movie.avg_rating > 0 && (
                <div className="mv-score emphasis">
                  <span className="mv-score-label">The Club</span>
                  <span className="mv-score-num">{parseFloat(movie.avg_rating).toFixed(1)}<sub>/10</sub></span>
                  <span className="mv-score-sub">{movie.rating_count} ratings</span>
                </div>
              )}
            </div>

            <div className="mv-actions">
              {!movie.started_at && isAuthenticated && (
                <button
                  className={`btn ${movie.is_attending ? 'ghost' : ''}`}
                  onClick={handleToggleAttendance}
                  disabled={togglingAttendance}
                >
                  {movie.is_attending
                    ? <><Icon name="check" size={16} /> <span>Attending</span></>
                    : <span>I'll be there</span>}
                </button>
              )}
              {movie.trailer_url && (
                <a
                  href={sanitizeUrl(movie.trailer_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn ghost"
                >
                  <Icon name="play" size={14} /> <span>Trailer</span>
                </a>
              )}
              {sanitizeImdbId(movie.imdb_id) && (
                <a
                  href={`https://www.imdb.com/title/${sanitizeImdbId(movie.imdb_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn text"
                >
                  IMDb →
                </a>
              )}
              {isAdmin && (
                <button
                  className="btn destructive sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ marginLeft: 'auto' }}
                >
                  <Icon name="trash" size={14} />
                  <span>{deleting ? 'Deleting…' : 'Delete'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Dossier rail */}
          <aside className="mv-dossier">
            <h4>Dossier</h4>
            <dl>
              {credits?.directors?.length > 0 && (
                <div className="row">
                  <dt>Director</dt>
                  <dd>{credits.directors.map(d => d.name).join(', ')}</dd>
                </div>
              )}
              {movie.original_language && (
                <div className="row">
                  <dt>Language</dt>
                  <dd>{getLanguageName(movie.original_language)}</dd>
                </div>
              )}
              {movie.release_year && (
                <div className="row">
                  <dt>Released</dt>
                  <dd>{movie.release_year}</dd>
                </div>
              )}
              {movie.runtime > 0 && (
                <div className="row">
                  <dt>Runtime</dt>
                  <dd>{formatRuntime(movie.runtime)}</dd>
                </div>
              )}
              {movie.announced_by_name && (
                <div className="row">
                  <dt>Picked by</dt>
                  <dd>{movie.announced_by_name}</dd>
                </div>
              )}
              {movie.collection_name && (
                <div className="row">
                  <dt>Collection</dt>
                  <dd>
                    <Link to={`/collections/${encodeURIComponent(movie.collection_name)}`}>
                      {movie.collection_name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </header>

      {/* ── Attendance ── */}
      {!movie.started_at && (
        <section>
          <SectionHead
            num="02"
            title="Who's coming"
            meta={movie.attendees?.length > 0 ? `${movie.attendees.length} confirmed` : 'None yet'}
          />
          {movie.attendees?.length > 0 ? (
            <div className="mv-attendees">
              {movie.attendees.map((attendee) => (
                <div key={attendee.discord_id} className="mv-attendee">
                  <img
                    src={getAvatarUrl(attendee.discord_id, attendee.avatar)}
                    alt={attendee.username}
                    className="mv-attendee-avatar"
                    loading="lazy"
                  />
                  <span className="mv-attendee-name">{attendee.username}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nobody confirmed yet."
              body={isAuthenticated ? "Be the first to confirm a seat." : "Log in to RSVP."}
            />
          )}
        </section>
      )}

      {/* ── Synopsis ── */}
      {movie.description && (
        <section>
          <SectionHead num={movie.started_at ? '02' : '03'} title="The picture" meta="Synopsis" />
          <div className="mv-synopsis">
            <p>{movie.description}</p>
          </div>
        </section>
      )}

      {/* ── Cast & Crew ── */}
      {credits && (credits.directors?.length > 0 || credits.cast?.length > 0) && (
        <section>
          <SectionHead
            num={movie.started_at ? '03' : '04'}
            title="The players"
            meta={`${(credits.directors?.length || 0) + (credits.cast?.length || 0)} credits`}
          />
          <div className="mv-credits">
            {credits.directors?.map((person, i) => (
              <article key={`d-${i}`} className="mv-credit">
                {person.profilePath ? (
                  <img src={person.profilePath} alt={person.name} className="mv-credit-photo" loading="lazy" />
                ) : (
                  <div className="mv-credit-photo placeholder">
                    {person.name?.charAt(0) ?? '?'}
                  </div>
                )}
                <div className="mv-credit-body">
                  <span className="mv-credit-role">Director</span>
                  <span className="mv-credit-name">{person.name}</span>
                </div>
              </article>
            ))}
            {credits.cast?.map((person, i) => (
              <article key={`c-${i}`} className="mv-credit">
                {person.profilePath ? (
                  <img src={person.profilePath} alt={person.name} className="mv-credit-photo" loading="lazy" />
                ) : (
                  <div className="mv-credit-photo placeholder">
                    {person.name?.charAt(0) ?? '?'}
                  </div>
                )}
                <div className="mv-credit-body">
                  <span className="mv-credit-role">Cast</span>
                  <span className="mv-credit-name">{person.name}</span>
                  {person.characterName && (
                    <span className="mv-credit-char">as {person.characterName}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Your rating ── */}
      <section>
        <SectionHead
          num="05"
          title="Your verdict"
          meta={ratingsAvailable ? 'Rating open' : 'Locked'}
        />
        {ratingsAvailable ? (
          isAuthenticated ? (
            <div className="mv-rating-block">
              <RatingInput
                currentRating={myRating}
                currentComment={myComment}
                onSubmit={handleSubmitRating}
              />
              {ratingMessage && (
                <p className={`mv-rating-msg ${ratingMessage.startsWith('Error') ? 'is-error' : 'is-success'}`}>
                  {ratingMessage}
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="user" size={32} stroke={1.25} />}
              title="Log in to rate."
              body="Discord sign-in lets you save a score and comment."
              action={<button onClick={login} className="btn">Log in with Discord</button>}
            />
          )
        ) : (
          <EmptyState
            icon={<Icon name="clock" size={32} stroke={1.25} />}
            title={movie.started_at ? 'Still playing.' : "Hasn't started yet."}
            body={
              movie.started_at
                ? `Ratings open in ${timeUntilRatings} minute${timeUntilRatings !== 1 ? 's' : ''}.`
                : 'Ratings open near the end of the screening.'
            }
          />
        )}
      </section>

      {/* ── All ratings ── */}
      {ratingsAvailable && movie.ratings?.length > 0 && (
        <section>
          <SectionHead
            num="06"
            title="The ledger"
            meta={`${movie.ratings.length} verdict${movie.ratings.length !== 1 ? 's' : ''}`}
          />
          <ul className="mv-ratings">
            {movie.ratings.map((rating) => (
              <li
                key={rating.id}
                className={`mv-rating${rating.attended === false ? ' is-absent' : ''}`}
              >
                <Link to={`/user/${rating.user_id}`} className="mv-rating-head">
                  <img
                    src={getAvatarUrl(rating.discord_id, rating.avatar)}
                    alt={rating.username}
                    className="mv-rating-avatar"
                    loading="lazy"
                  />
                  <span className="mv-rating-user">{rating.username}</span>
                  <span className="mv-rating-score">
                    {parseFloat(rating.score).toFixed(1)}<sub>/10</sub>
                  </span>
                </Link>
                {rating.attended === false && (
                  <Eyebrow className="mv-rating-absent">Wasn't in the call</Eyebrow>
                )}
                {rating.comment && (
                  <p className="mv-rating-comment">&ldquo;{rating.comment}&rdquo;</p>
                )}
                <RatingReactions
                  ratingId={rating.id}
                  currentUserId={user?.id}
                  ratingUserId={rating.user_id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Similar movies ── */}
      {movie.tmdb_id && (
        <section>
          <SectionHead
            num="07"
            title="Further viewing"
            meta={loadingSimilar ? 'Loading…' : `${similarMovies.length} titles`}
          />
          {loadingSimilar ? (
            <div className="mv-similar-grid">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="mv-similar">
                  <div className="skeleton rect" />
                  <div className="skeleton line" style={{ width: '70%', marginTop: 12 }} />
                </div>
              ))}
            </div>
          ) : similarMovies.length > 0 ? (
            <div className="mv-similar-grid">
              {similarMovies.map((similar) => (
                <article key={similar.id} className="mv-similar">
                  <div className="mv-similar-poster">
                    {similar.posterPath ? (
                      <img src={similar.posterPath} alt={similar.title} loading="lazy" />
                    ) : (
                      <span className="mv-similar-placeholder">
                        {similar.title?.charAt(0) ?? '?'}
                      </span>
                    )}
                  </div>
                  <div className="mv-similar-body">
                    <h4 className="mv-similar-title">{similar.title}</h4>
                    {similar.year && <span className="mv-similar-year">{similar.year}</span>}
                    <div className="mv-similar-actions">
                      {sanitizeImdbId(similar.imdbId) && (
                        <a
                          href={`https://www.imdb.com/title/${sanitizeImdbId(similar.imdbId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn text sm"
                        >
                          IMDb →
                        </a>
                      )}
                      {similar.trailerUrl && (
                        <a
                          href={sanitizeUrl(similar.trailerUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn text sm"
                        >
                          <Icon name="play" size={12} /> Trailer
                        </a>
                      )}
                      {isAuthenticated && (
                        <button
                          className="btn text sm"
                          onClick={() => setQuickAddMovie(similar)}
                        >
                          <Icon name="plus" size={12} /> Wishlist
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No suggestions." body="TMDB didn't return anything similar for this one." />
          )}
        </section>
      )}

      {quickAddMovie && (
        <QuickAddToWishlist
          movie={quickAddMovie}
          onClose={() => setQuickAddMovie(null)}
          onSuccess={() => setQuickAddMovie(null)}
        />
      )}
    </div>
  );
};

export default Movie;
