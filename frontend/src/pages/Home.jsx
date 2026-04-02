import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../utils/sanitizeUrl';
import { formatDate, formatRuntime, getAvatarUrl } from '../utils/helpers';
import {
  getMovies,
  getActiveVoting,
  getNextMovieWithAttendees,
  getUpcomingMoviesWithAttendees,
  getRandomComments,
  toggleAttendance,
  castVote,
  removeVote
} from '../api/client';
import { StarRating, MovieCard, MovieCardSkeleton } from '../components/common';
import { AdminSettingsPanel, AnnounceFlow, CommentsTicker, UsersSection, ExploreSection } from '../components/home';
import './Home.css';

const Home = () => {
  const { isAuthenticated, isAdmin, user } = useAuth();
  const [movies, setMovies] = useState([]);
  const [voting, setVoting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextMovieWithAttendees, setNextMovieWithAttendees] = useState(null);
  const [upcomingWithAttendees, setUpcomingWithAttendees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [votingLoading, setVotingLoading] = useState(false);
  const reviewsRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [moviesData, votingData, nextMovieData, upcomingData, reviewsData] = await Promise.all([
        getMovies(100, 0),
        getActiveVoting().catch(() => null),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => []),
        getRandomComments(12).catch(() => [])
      ]);
      setMovies(moviesData);
      setVoting(votingData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
      setReviews(reviewsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDataRefresh = useCallback(async () => {
    try {
      const [moviesData, nextMovieData, upcomingData] = await Promise.all([
        getMovies(100, 0),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => [])
      ]);
      setMovies(moviesData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }, []);

  const handleAttendanceToggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || !nextMovie) return;
    setTogglingAttendance(true);
    try {
      const result = await toggleAttendance(nextMovie.id);
      setNextMovieWithAttendees({
        ...nextMovie,
        attendees: result.attendees,
        is_attending: result.attending
      });
    } catch (err) {
      console.error('Error toggling attendance:', err);
    } finally {
      setTogglingAttendance(false);
    }
  };

  const handleVote = async (suggestionId) => {
    if (!isAuthenticated || votingLoading) return;
    setVotingLoading(true);
    try {
      const isCurrentVote = voting?.user_vote?.suggestion_id === suggestionId;
      if (isCurrentVote) {
        await removeVote(suggestionId);
      } else {
        await castVote(suggestionId);
      }
      const votingData = await getActiveVoting();
      setVoting(votingData);
    } catch (err) {
      console.error('Error voting:', err);
    } finally {
      setVotingLoading(false);
    }
  };

  const scrollReviews = (direction) => {
    if (reviewsRef.current) {
      const scrollAmount = 340;
      reviewsRef.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const upcomingMovies = movies
    .filter(movie => new Date(movie.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const bestRatedThisMonth = movies
    .filter(movie => {
      const date = new Date(movie.scheduled_at);
      return date >= startOfMonth && date <= endOfMonth && parseFloat(movie.avg_rating) > 0;
    })
    .sort((a, b) => parseFloat(b.avg_rating) - parseFloat(a.avg_rating))
    .slice(0, 5);

  const nextMovie = nextMovieWithAttendees || upcomingMovies[0];
  const totalVotes = voting?.suggestions?.reduce((sum, s) => sum + parseInt(s.vote_count), 0) || 0;

  const heroBackdrop = nextMovie
    ? sanitizeImageUrl(nextMovie.backdrop_url) || sanitizeImageUrl(nextMovie.image_url)
    : null;

  return (
    <div className="cinematic-home">
      {isAdmin && <AdminSettingsPanel onDataRefresh={handleDataRefresh} />}

      {/* ═══ HERO SPLIT: 70% Movie / 30% Voting ═══ */}
      <section className="hero-split">
        {/* Left: Up Next Hero */}
        <div className="hero-main">
          {heroBackdrop && (
            <div
              className="hero-main-bg"
              style={{ backgroundImage: `url(${heroBackdrop})` }}
            />
          )}
          <div className="hero-main-overlay" />

          <div className="hero-main-content">
            {loading ? (
              <div className="hero-loading">
                <div className="skeleton-block" style={{ width: '40%', height: 20 }} />
                <div className="skeleton-block" style={{ width: '70%', height: 44 }} />
                <div className="skeleton-block" style={{ width: '50%', height: 18 }} />
                <div className="skeleton-block" style={{ width: '90%', height: 60 }} />
              </div>
            ) : nextMovie ? (
              <>
                <span className="hero-label">Up Next</span>
                <h1 className="hero-movie-title">
                  <Link to={`/movie/${nextMovie.id}`}>{nextMovie.title}</Link>
                </h1>

                <div className="hero-movie-meta">
                  {nextMovie.release_year && <span>{nextMovie.release_year}</span>}
                  {nextMovie.runtime > 0 && (
                    <>
                      <span className="meta-sep">|</span>
                      <span>{formatRuntime(nextMovie.runtime)}</span>
                    </>
                  )}
                  {nextMovie.genres && (
                    <>
                      <span className="meta-sep">|</span>
                      <span>{nextMovie.genres}</span>
                    </>
                  )}
                </div>

                {nextMovie.description && (
                  <p className="hero-movie-desc">{nextMovie.description}</p>
                )}

                <p className="hero-showing">
                  <strong>Next Showing:</strong> {formatDate(nextMovie.scheduled_at, 'long')}
                </p>

                {nextMovie.announced_by_name && (
                  <div className="hero-picked-by">
                    <span>Picked by</span>
                    {nextMovie.announced_by_avatar && (
                      <img
                        src={getAvatarUrl(nextMovie.announced_by_discord_id, nextMovie.announced_by_avatar)}
                        alt=""
                        className="picked-by-avatar"
                      />
                    )}
                    <span className="picked-by-name">{nextMovie.announced_by_name}</span>
                  </div>
                )}

                <div className="hero-actions-row">
                  {isAuthenticated && (
                    <button
                      className={`hero-action-btn ${nextMovie.is_attending ? 'btn-attending' : 'btn-attend'}`}
                      onClick={handleAttendanceToggle}
                      disabled={togglingAttendance}
                    >
                      {togglingAttendance ? '...' : nextMovie.is_attending ? '\u2713 Attending' : 'Attend'}
                    </button>
                  )}
                  {nextMovie.trailer_url && (
                    <a
                      href={sanitizeUrl(nextMovie.trailer_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hero-action-btn btn-trailer"
                    >
                      Watch Trailer
                    </a>
                  )}
                  {sanitizeImdbId(nextMovie.imdb_id) && (
                    <a
                      href={`https://www.imdb.com/title/${sanitizeImdbId(nextMovie.imdb_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hero-action-btn btn-imdb"
                    >
                      IMDb
                    </a>
                  )}
                </div>

                {/* Attendee avatars */}
                {nextMovie.attendees && nextMovie.attendees.length > 0 && (
                  <div className="hero-attendees">
                    <div className="attendee-stack">
                      {nextMovie.attendees.slice(0, 6).map((a) => (
                        <img
                          key={a.discord_id}
                          src={getAvatarUrl(a.discord_id, a.avatar)}
                          alt={a.username}
                          title={a.username}
                          className="attendee-avatar"
                        />
                      ))}
                      {nextMovie.attendees.length > 6 && (
                        <span className="attendee-more">+{nextMovie.attendees.length - 6}</span>
                      )}
                    </div>
                    <span className="attendee-label">{nextMovie.attendees.length} attending</span>
                  </div>
                )}
              </>
            ) : (
              <div className="hero-empty-state">
                <h2>No movie scheduled</h2>
                <p>Announce a movie or start a vote to pick the next one!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Voting Sidebar */}
        <div className="hero-sidebar">
          {loading ? (
            <div className="sidebar-card">
              <div className="sidebar-header">
                <h2>Vote for Next Movie</h2>
              </div>
              <div className="sidebar-body">
                <div className="skeleton-block" style={{ height: 60 }} />
                <div className="skeleton-block" style={{ height: 60 }} />
                <div className="skeleton-block" style={{ height: 60 }} />
              </div>
            </div>
          ) : voting && voting.suggestions?.length > 0 ? (
            <div className="sidebar-card">
              <div className="sidebar-header">
                <h2>Vote for Next Movie</h2>
                <span className="sidebar-badge">Voting Open! {voting.suggestions.length} Candidates</span>
              </div>
              <div className="sidebar-body">
                {voting.suggestions.map((suggestion) => {
                  const isVoted = voting.user_vote?.suggestion_id === suggestion.id;
                  return (
                    <div
                      key={suggestion.id}
                      className={`vote-candidate ${isVoted ? 'voted' : ''}`}
                    >
                      {suggestion.image_url && (
                        <img
                          src={suggestion.image_url}
                          alt=""
                          className="candidate-poster"
                          loading="lazy"
                        />
                      )}
                      <div className="candidate-info">
                        <span className="candidate-title">{suggestion.title}</span>
                        <span className="candidate-votes">{suggestion.vote_count} votes</span>
                      </div>
                      {isAuthenticated && (
                        <button
                          className={`candidate-vote-btn ${isVoted ? 'voted' : ''}`}
                          onClick={() => handleVote(suggestion.id)}
                          disabled={votingLoading}
                        >
                          {isVoted ? 'Voted' : 'Vote'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="sidebar-card sidebar-empty">
              <div className="sidebar-header">
                <h2>Vote for Next Movie</h2>
              </div>
              <div className="sidebar-body sidebar-body-centered">
                <p>No active voting session.</p>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>Start a vote from Discord or the website.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ RECENT REVIEWS CAROUSEL ═══ */}
      {reviews.length > 0 && (
        <section className="reviews-section">
          <div className="section-header">
            <h2>Recent Reviews</h2>
          </div>
          <div className="reviews-carousel-wrapper">
            <button className="carousel-arrow carousel-arrow-left" onClick={() => scrollReviews('left')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="reviews-carousel" ref={reviewsRef}>
              {reviews.map((review, i) => (
                <div key={i} className="review-card">
                  <div className="review-card-header">
                    <img
                      src={getAvatarUrl(review.discord_id, review.avatar)}
                      alt=""
                      className="review-avatar"
                      loading="lazy"
                    />
                    <span className="review-username">{review.username}</span>
                  </div>
                  <div className="review-card-body">
                    <div className="review-details">
                      <div className="review-stars">
                        {'★'.repeat(Math.round(parseFloat(review.score) / 2))}
                        {'☆'.repeat(5 - Math.round(parseFloat(review.score) / 2))}
                        <span className="review-score">{parseFloat(review.score).toFixed(1)}/10</span>
                      </div>
                      <span className="review-movie-title">{review.movie_title}</span>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="review-comment">"{review.comment}"</p>
                  )}
                </div>
              ))}
            </div>
            <button className="carousel-arrow carousel-arrow-right" onClick={() => scrollReviews('right')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>
      )}

      {/* ═══ UPCOMING & BEST RATED ═══ */}
      <div className="home-bottom-row">
        <section className="home-section">
          <div className="section-header">
            <h2>Upcoming</h2>
            <Link to="/movies" className="view-all">All Movies {'\u2192'}</Link>
          </div>
          {loading ? (
            <div className="upcoming-compact">
              <MovieCardSkeleton />
            </div>
          ) : upcomingWithAttendees.length <= 1 ? (
            <div className="empty-state compact">
              <p>No more upcoming movies.</p>
            </div>
          ) : (
            <div className="upcoming-compact">
              {upcomingWithAttendees.slice(1, 4).map((movie) => (
                <MovieCard key={movie.id} movie={movie} variant="compact" />
              ))}
            </div>
          )}
        </section>

        <section className="home-section">
          <div className="section-header">
            <h2>Best This Month</h2>
            <Link to="/stats" className="view-all">Stats {'\u2192'}</Link>
          </div>
          {loading ? (
            <div className="best-rated-list compact">
              {[1, 2, 3].map((i) => (
                <div key={i} className="best-rated-item best-rated-skeleton">
                  <div className="skeleton-block" style={{ width: 30, height: 20 }} />
                  <div className="skeleton-block" style={{ width: 30, height: 45 }} />
                  <div className="best-rated-info">
                    <div className="skeleton-block" style={{ width: 100, height: 16 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : bestRatedThisMonth.length === 0 ? (
            <div className="empty-state compact">
              <p>No rated movies yet.</p>
            </div>
          ) : (
            <div className="best-rated-list compact">
              {bestRatedThisMonth.slice(0, 4).map((movie, index) => (
                <Link to={`/movie/${movie.id}`} key={movie.id} className="best-rated-item">
                  <span className="rank">#{index + 1}</span>
                  {movie.image_url && (
                    <img src={movie.image_url} alt={movie.title} className="best-rated-poster" loading="lazy" />
                  )}
                  <div className="best-rated-info">
                    <span className="best-rated-title">{movie.title}</span>
                    <StarRating rating={parseFloat(movie.avg_rating)} size="small" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <CommentsTicker />

      <ExploreSection />

      <UsersSection />

      {/* ═══ ANNOUNCE FLOW ═══ */}
      {isAuthenticated && <AnnounceFlow onAnnounced={handleDataRefresh} />}
    </div>
  );
};

export default Home;
