import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../utils/sanitizeUrl';
import { formatDate, formatRuntime, getAvatarUrl, formatRelativeTime } from '../utils/helpers';
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
import { AdminSettingsPanel, UsersSection, AnnounceFlow } from '../components/home';
import { Icon, SectionHead, Skeleton, EmptyState, Badge } from '../components/ui';
import './Home.css';

const Home = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [movies, setMovies] = useState([]);
  const [voting, setVoting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextMovieWithAttendees, setNextMovieWithAttendees] = useState(null);
  const [upcomingWithAttendees, setUpcomingWithAttendees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [votingLoading, setVotingLoading] = useState(false);

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

  const lastMovie = !nextMovie
    ? movies
        .filter(movie => new Date(movie.scheduled_at) <= now)
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))[0]
    : null;

  const heroMovie = nextMovie || lastMovie;
  const isHeroPast = !nextMovie && !!lastMovie;

  // Recent past screenings for the "Last screenings" strip. Skip the one already
  // featured in the hero (only happens when there's nothing upcoming) to avoid a dupe.
  const lastScreenings = movies
    .filter((movie) => new Date(movie.scheduled_at) <= now)
    .filter((movie) => !(isHeroPast && heroMovie && movie.id === heroMovie.id))
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
    .slice(0, 3);

  const heroBackdrop = heroMovie
    ? sanitizeImageUrl(heroMovie.backdrop_url) || sanitizeImageUrl(heroMovie.image_url)
    : null;

  return (
    <div className="home">
      {isAdmin && <AdminSettingsPanel onDataRefresh={handleDataRefresh} />}

      {/* ═══ HERO — Feature + voting ═══ */}
      <section className="hero-split">
        <article className="hero-feature">
          {heroBackdrop && (
            <div
              className="hero-bg"
              style={{ backgroundImage: `url(${heroBackdrop})` }}
              aria-hidden="true"
            />
          )}
          <div className="hero-scrim" aria-hidden="true" />

          <div className="hero-top">
            <span className="eyebrow">
              {isHeroPast ? 'Last screening' : 'Tonight\u2019s feature'}
            </span>
            {!isHeroPast && nextMovie?.attendees?.length > 0 && (
              <Badge live>
                {nextMovie.attendees.length} attending
              </Badge>
            )}
          </div>

          <div className="hero-body">
            {loading ? (
              <div className="hero-loading">
                <Skeleton variant="line" width="40%" height={14} />
                <Skeleton variant="line" size="lg" width="70%" height={48} style={{ marginTop: 12 }} />
                <Skeleton variant="line" width="50%" height={14} style={{ marginTop: 16 }} />
                <Skeleton variant="line" width="90%" height={60} style={{ marginTop: 20 }} />
              </div>
            ) : heroMovie ? (
              <>
                <div className="hero-meta">
                  {heroMovie.release_year && <span>{heroMovie.release_year}</span>}
                  {heroMovie.runtime > 0 && (
                    <>
                      <span className="sep" />
                      <span>{formatRuntime(heroMovie.runtime)}</span>
                    </>
                  )}
                  {heroMovie.genres && (
                    <>
                      <span className="sep" />
                      <span>{heroMovie.genres}</span>
                    </>
                  )}
                </div>

                <h1 className="hero-title">
                  <Link to={`/movie/${heroMovie.id}`}>{heroMovie.title}</Link>
                </h1>

                {heroMovie.description && (
                  <p className="hero-desc">{heroMovie.description}</p>
                )}

                <div className="hero-showing">
                  <Icon name="calendar" size={14} stroke={1.5} />
                  <span>
                    {isHeroPast ? 'Watched' : 'Next'} · {formatDate(heroMovie.scheduled_at, 'long')}
                  </span>
                  {heroMovie.announced_by_name && (
                    <>
                      <span className="sep" />
                      <span>Picked by</span>
                      {heroMovie.announced_by_avatar && (
                        <img
                          src={getAvatarUrl(heroMovie.announced_by_discord_id, heroMovie.announced_by_avatar)}
                          alt=""
                          className="pickedby-avatar"
                          loading="lazy"
                        />
                      )}
                      <span className="pickedby-name">{heroMovie.announced_by_name}</span>
                    </>
                  )}
                </div>

                <div className="hero-actions">
                  {!isHeroPast && isAuthenticated && (
                    <button
                      className={`btn ${nextMovie?.is_attending ? 'ghost' : ''}`}
                      onClick={handleAttendanceToggle}
                      disabled={togglingAttendance}
                    >
                      {nextMovie?.is_attending
                        ? <><Icon name="check" size={16} /> <span>Attending</span></>
                        : <span>I'll be there</span>}
                    </button>
                  )}
                  {heroMovie.trailer_url && (
                    <a
                      href={sanitizeUrl(heroMovie.trailer_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn ghost"
                    >
                      <Icon name="play" size={14} />
                      <span>Trailer</span>
                    </a>
                  )}
                  {sanitizeImdbId(heroMovie.imdb_id) && (
                    <a
                      href={`https://www.imdb.com/title/${sanitizeImdbId(heroMovie.imdb_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn text"
                    >
                      IMDb →
                    </a>
                  )}
                </div>

                {!isHeroPast && nextMovie?.attendees?.length > 0 && (
                  <div className="hero-attendees">
                    <div className="attendee-stack">
                      {nextMovie.attendees.slice(0, 6).map((a) => (
                        <img
                          key={a.discord_id}
                          src={getAvatarUrl(a.discord_id, a.avatar)}
                          alt={a.username}
                          title={a.username}
                          className="attendee-avatar"
                          loading="lazy"
                        />
                      ))}
                      {nextMovie.attendees.length > 6 && (
                        <span className="attendee-more">+{nextMovie.attendees.length - 6}</span>
                      )}
                    </div>
                    <span className="attendee-label">
                      {nextMovie.attendees.length} confirmed
                    </span>
                  </div>
                )}

                {isHeroPast && heroMovie.avg_rating > 0 && (
                  <div className="hero-past-rating">
                    <span className="past-score">{parseFloat(heroMovie.avg_rating).toFixed(1)}<sub>/10</sub></span>
                    <span className="past-votes">from {heroMovie.rating_count} ratings</span>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Icon name="film" size={40} stroke={1.25} />}
                title="No screenings yet."
                body="The first film announces itself when the host picks a night."
              />
            )}
          </div>
        </article>

        {/* Tabbed sidebar: Announce + Vote share the space */}
        <HomeSidebar
          isAuthenticated={isAuthenticated}
          loading={loading}
          voting={voting}
          votingLoading={votingLoading}
          onVote={handleVote}
          onAnnounced={fetchData}
        />
      </section>

      {/* ═══ Reviews carousel — auto-scrolling ═══ */}
      {reviews.length > 0 && (
        <section className="home-block">
          <SectionHead num="02" title="Recent dispatches" meta={`${reviews.length} reviews · live`} />
          <div className="reviews-wrap">
            <div className="reviews-marquee">
              <div className="reviews-track">
                {[...reviews, ...reviews].map((review, i) => (
                  <article key={i} className="review-card" aria-hidden={i >= reviews.length ? 'true' : undefined}>
                    <header className="review-head">
                      <img
                        src={getAvatarUrl(review.discord_id, review.avatar)}
                        alt=""
                        className="review-avatar"
                        loading="lazy"
                      />
                      <div className="review-who">
                        <span className="review-username">{review.username}</span>
                        {review.created_at && (
                          <span className="review-time">{formatRelativeTime(review.created_at)}</span>
                        )}
                      </div>
                    </header>
                    <div className="review-body">
                      {review.image_url && (
                        <img src={review.image_url} alt="" className="review-poster" loading="lazy" />
                      )}
                      <div className="review-main">
                        <div className="review-score">
                          <span className="score-num">{parseFloat(review.score).toFixed(1)}</span>
                          <span className="score-denom">/ 10</span>
                        </div>
                        <div className="review-movie">{review.movie_title}</div>
                      </div>
                    </div>
                    {review.comment && (
                      <p className="review-comment">&ldquo;{review.comment}&rdquo;</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Upcoming + Best rated ═══ */}
      <div className="home-bottom">
        <section className="home-block">
          <SectionHead
            num="03"
            title="On the calendar"
            meta={<Link to="/movies" className="btn text">Archive →</Link>}
          />
          {loading ? (
            <div className="upcoming-grid">
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
            </div>
          ) : upcomingWithAttendees.length <= 1 ? (
            <EmptyState
              title="Nothing queued."
              body="Announce a movie to start the next screening."
            />
          ) : (
            <div className="upcoming-grid">
              {upcomingWithAttendees.slice(1, 4).map((movie) => (
                <MovieCard key={movie.id} movie={movie} variant="compact" />
              ))}
            </div>
          )}
        </section>

        <section className="home-block">
          <SectionHead
            num="04"
            title="Best this month"
            meta={<Link to="/stats" className="btn text">Stats →</Link>}
          />
          {loading ? (
            <div className="best-list">
              {[1, 2, 3].map((i) => (
                <div key={i} className="best-item">
                  <Skeleton variant="line" width={24} height={20} />
                  <Skeleton variant="rect" width={32} height={48} />
                  <Skeleton variant="line" width="60%" height={16} />
                </div>
              ))}
            </div>
          ) : bestRatedThisMonth.length === 0 ? (
            <EmptyState
              title="No ratings yet."
              body="Rate a movie after the screening and it'll appear here."
            />
          ) : (
            <ol className="best-list">
              {bestRatedThisMonth.slice(0, 4).map((movie, index) => (
                <li key={movie.id}>
                  <Link to={`/movie/${movie.id}`} className="best-item">
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    {movie.image_url && (
                      <img src={movie.image_url} alt={movie.title} className="best-poster" loading="lazy" />
                    )}
                    <div className="best-info">
                      <span className="best-title">{movie.title}</span>
                      <StarRating rating={parseFloat(movie.avg_rating)} size="small" />
                    </div>
                    <Icon name="arrow-right" size={16} stroke={1.5} className="best-arrow" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ═══ Last screenings ═══ */}
      <section className="home-block">
        <SectionHead
          num="05"
          title="Last screenings"
          meta={<Link to="/movies" className="btn text">Archive →</Link>}
        />
        {loading ? (
          <div className="upcoming-grid">
            <MovieCardSkeleton />
            <MovieCardSkeleton />
            <MovieCardSkeleton />
          </div>
        ) : lastScreenings.length === 0 ? (
          <EmptyState
            title="No screenings yet."
            body="Past movie nights show up here once you've watched one."
          />
        ) : (
          <div className="upcoming-grid">
            {lastScreenings.map((movie) => (
              <MovieCard key={movie.id} movie={movie} variant="compact" />
            ))}
          </div>
        )}
      </section>

      <UsersSection />

    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   Home sidebar — toggles between Announce and Vote in the same slot.
   ═══════════════════════════════════════════════════════════════════════ */
function HomeSidebar({ isAuthenticated, loading, voting, votingLoading, onVote, onAnnounced }) {
  const hasActiveVote = voting && voting.suggestions?.length > 0;

  // Default tab: Announce if authenticated, otherwise Vote (if active), else Announce
  const [tab, setTab] = useState(() =>
    isAuthenticated ? 'announce' : (hasActiveVote ? 'vote' : 'announce')
  );

  // If voting becomes active while sitting on announce, keep the user where they are
  // but nudge via the tab badge. No auto-switch.

  return (
    <aside className="home-sidebar">
      <nav className="hs-tabs" role="tablist" aria-label="Home sidebar">
        <button
          role="tab"
          aria-selected={tab === 'announce'}
          className={`hs-tab ${tab === 'announce' ? 'active' : ''}`}
          onClick={() => setTab('announce')}
        >
          <Icon name="megaphone" size={14} stroke={1.5} />
          <span>Announce</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'vote'}
          className={`hs-tab ${tab === 'vote' ? 'active' : ''}`}
          onClick={() => setTab('vote')}
        >
          <Icon name="star" size={14} stroke={1.5} />
          <span>Vote</span>
          {hasActiveVote && <span className="hs-tab-dot" aria-label="Vote open" />}
        </button>
      </nav>

      <div className="hs-panel" role="tabpanel">
        {tab === 'announce' ? (
          isAuthenticated ? (
            <AnnounceFlow onAnnounced={onAnnounced} />
          ) : (
            <div className="hs-login">
              <div className="hs-login-eyebrow">Host the next night</div>
              <h3 className="hs-login-title">Want to schedule the next movie?</h3>
              <p>Log in with Discord and use this space to search a film, pick a date, and announce it to the club.</p>
            </div>
          )
        ) : loading ? (
          <div className="hv-body">
            <Skeleton variant="line" size="lg" height={54} />
            <Skeleton variant="line" size="lg" height={54} style={{ marginTop: 12 }} />
            <Skeleton variant="line" size="lg" height={54} style={{ marginTop: 12 }} />
          </div>
        ) : hasActiveVote ? (
          <VoteList
            voting={voting}
            isAuthenticated={isAuthenticated}
            onVote={onVote}
            disabled={votingLoading}
          />
        ) : (
          <div className="hv-empty">
            <p>No active vote.</p>
            <small>Start one from Discord or the website.</small>
          </div>
        )}
      </div>
    </aside>
  );
}

function VoteList({ voting, isAuthenticated, onVote, disabled }) {
  const totalVotes = voting.suggestions.reduce((sum, s) => sum + parseInt(s.vote_count), 0);
  return (
    <>
      <header className="hv-head">
        <div>
          <div className="hv-eyebrow">The vote</div>
          <h3 className="hv-title">Pick the next movie</h3>
        </div>
        <Badge live>Open</Badge>
      </header>
      <ul className="hv-list">
        {voting.suggestions.map((suggestion) => {
          const isVoted = voting.user_vote?.suggestion_id === suggestion.id;
          const pct = totalVotes > 0 ? (parseInt(suggestion.vote_count) / totalVotes) * 100 : 0;
          return (
            <li
              key={suggestion.id}
              className={`vote-item ${isVoted ? 'voted' : ''}`}
              onClick={() => isAuthenticated && !disabled && onVote(suggestion.id)}
            >
              {suggestion.image_url ? (
                <img src={suggestion.image_url} alt="" className="vote-poster" loading="lazy" />
              ) : (
                <div className="vote-poster no-poster">
                  <Icon name="film" size={16} />
                </div>
              )}
              <div className="vote-info">
                <span className="vote-title">{suggestion.title}</span>
                <div className="vote-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="vote-count">{suggestion.vote_count}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default Home;
