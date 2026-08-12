import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../utils/sanitizeUrl';
import { formatDate, formatRuntime, getAvatarUrl } from '../utils/helpers';
import {
  getMovies,
  getNowPlayingMovie,
  getNextMovieWithAttendees,
  getUpcomingMoviesWithAttendees,
  getRandomComments,
  toggleAttendance,
  getStats,
  getOnThisDay,
  getCalendar
} from '../api/client';
import { getSeasonalTheme } from '../utils/seasonalTheme';
import { StarRating, MovieCard, MovieCardSkeleton } from '../components/common';
import { AdminSettingsPanel, UsersSection, AnnounceFlow, SuggestionBoard, HomeStatsBand, HomeHallOfFame, OnThisDay, SeasonalDecoration, ReviewsFeature, OnTheCalendar, ScheduleSection } from '../components/home';
import { Icon, SectionHead, Skeleton, EmptyState, Badge } from '../components/ui';
import './Home.css';

const Home = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [nextMovieWithAttendees, setNextMovieWithAttendees] = useState(null);
  const [upcomingWithAttendees, setUpcomingWithAttendees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [seasonPreview, setSeasonPreview] = useState(null);
  const [onThisDay, setOnThisDay] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [scheduleMovie, setScheduleMovie] = useState(null);   // picked movie → full-width scheduler
  const [togglingAttendance, setTogglingAttendance] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [moviesData, nowPlayingData, nextMovieData, upcomingData, reviewsData, statsData, onThisDayData, calendarData] = await Promise.all([
        getMovies(100, 0),
        getNowPlayingMovie().catch(() => null),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => []),
        getRandomComments(12).catch(() => []),
        getStats().catch(() => null),
        getOnThisDay().catch(() => null),
        getCalendar().catch(() => [])
      ]);
      setMovies(moviesData);
      setNowPlaying(nowPlayingData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
      setReviews(reviewsData);
      setStats(statsData);
      setOnThisDay(onThisDayData);
      setCalendar(calendarData);
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
      const [moviesData, nowPlayingData, nextMovieData, upcomingData] = await Promise.all([
        getMovies(100, 0),
        getNowPlayingMovie().catch(() => null),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => [])
      ]);
      setMovies(moviesData);
      setNowPlaying(nowPlayingData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }, []);

  // Just the hero's own data — cheap enough to re-run on a timer, unlike
  // fetchData which also pulls 100 movies, stats, reviews and the calendar.
  const refreshHero = useCallback(async () => {
    const [nowPlayingData, nextMovieData, upcomingData] = await Promise.all([
      getNowPlayingMovie().catch(() => null),
      getNextMovieWithAttendees().catch(() => null),
      getUpcomingMoviesWithAttendees(5).catch(() => [])
    ]);
    setNowPlaying(nowPlayingData);
    setNextMovieWithAttendees(nextMovieData);
    setUpcomingWithAttendees(upcomingData);
  }, []);

  // When the hero next changes state, to the millisecond: a film starts at its
  // scheduled time and stops airing one runtime later. Both are already known,
  // so the page schedules one refetch for that moment instead of polling.
  const nextTransitionAt = useMemo(() => {
    if (nowPlaying?.started_at) {
      return new Date(nowPlaying.started_at).getTime() + (nowPlaying.runtime || 90) * 60000;
    }
    const upcoming = nextMovieWithAttendees || upcomingWithAttendees[0];
    return upcoming?.scheduled_at ? new Date(upcoming.scheduled_at).getTime() : null;
  }, [nowPlaying, nextMovieWithAttendees, upcomingWithAttendees]);

  useEffect(() => {
    if (!nextTransitionAt) return;   // nothing scheduled — stay idle, no requests

    // movieStarter runs on a one-minute cron, so started_at lags scheduled_at.
    // The buffer absorbs that; if the flip still hasn't landed (bot down, laptop
    // asleep) fall back to a slow re-check rather than spinning.
    const TRANSITION_BUFFER_MS = 15_000;
    const RECHECK_MS = 30_000;
    // setTimeout overflows int32 (~24.8 days) and fires immediately, which would
    // spin. Anything further out just re-arms on the next pass.
    const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

    const delay = nextTransitionAt + TRANSITION_BUFFER_MS - Date.now();
    const wait = delay > 0 ? Math.min(delay, MAX_DELAY_MS) : RECHECK_MS;
    const timer = setTimeout(refreshHero, wait);
    return () => clearTimeout(timer);
  }, [nextTransitionAt, refreshHero]);

  // Background tabs get their timers throttled, so a laptop that slept through
  // the transition catches up the moment it comes back.
  useEffect(() => {
    if (!nextTransitionAt) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshHero();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [nextTransitionAt, refreshHero]);

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

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const seasonOverride =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('season')
      : null;
  // Admin theme preview (from the Admin Settings switch) takes precedence over
  // the ?season= URL override, which takes precedence over today's real date.
  const seasonal = getSeasonalTheme(new Date(), seasonPreview || seasonOverride);

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

  const lastMovie = !nowPlaying && !nextMovie
    ? movies
        .filter(movie => new Date(movie.scheduled_at) <= now)
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))[0]
    : null;

  // Three states, in priority order: a film on screen right now beats an
  // upcoming one, which beats falling back to the last screening. Without the
  // first, a movie that had started dropped out of "next" and the hero called
  // it "Watched" while it was still playing.
  const heroMovie = nowPlaying || nextMovie || lastMovie;
  const heroState = nowPlaying ? 'playing' : (nextMovie ? 'upcoming' : (lastMovie ? 'past' : 'empty'));
  const isHeroPast = heroState === 'past';
  const isHeroPlaying = heroState === 'playing';

  // When it's playing we know exactly when it ends; runtime defaults to 90 the
  // same way the bot's rating window does.
  const heroEndsAt = isHeroPlaying && nowPlaying.started_at
    ? new Date(new Date(nowPlaying.started_at).getTime() + (nowPlaying.runtime || 90) * 60000)
    : null;

  // The RSVP list belongs to whichever movie the hero is showing — the people
  // who said they'd come are the people watching once it starts.
  const heroAttendees = (isHeroPlaying ? nowPlaying?.attendees : nextMovie?.attendees) || [];

  // The "On the calendar" slot shows upcoming nights beyond the hero when there
  // are any; otherwise it backfills with recent past screenings so it isn't empty
  // during the (common) spontaneous stretches with nothing scheduled.
  const hasUpcomingExtras = upcomingWithAttendees.length > 1;

  const lastScreenings = movies
    .filter((movie) => new Date(movie.scheduled_at) <= now)
    // Don't list the hero film again below itself — it qualifies as "past" by
    // scheduled_at while it's still on screen.
    .filter((movie) => !((isHeroPast || isHeroPlaying) && heroMovie && movie.id === heroMovie.id))
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
    .slice(0, 4);

  // The calendar slot always renders the compact agenda: upcoming nights when we
  // have them, otherwise recent screenings mapped into the same shape.
  const calendarItems = calendar.length > 0
    ? calendar
    : lastScreenings.map((m) => ({
        id: m.id, kind: 'one-off', title: m.title, scheduled_at: m.scheduled_at,
        image_url: m.image_url, runtime: m.runtime, release_year: m.release_year
      }));

  const heroBackdrop = heroMovie
    ? sanitizeImageUrl(heroMovie.backdrop_url) || sanitizeImageUrl(heroMovie.image_url)
    : null;

  return (
    <div className={`home ${seasonal ? seasonal.className : ''}`.trim()}>
      {seasonal && <SeasonalDecoration theme={seasonal.key} />}
      {isAdmin && (
        <AdminSettingsPanel
          onDataRefresh={handleDataRefresh}
          seasonPreview={seasonPreview}
          onSeasonPreviewChange={setSeasonPreview}
        />
      )}

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
              {isHeroPlaying
                ? 'Now playing'
                : (seasonal && !isHeroPast
                    ? seasonal.eyebrow
                    : (isHeroPast ? 'Last screening' : 'Tonight\u2019s feature'))}
            </span>
            {isHeroPlaying ? (
              <Badge live accent>Airing</Badge>
            ) : (!isHeroPast && nextMovie?.attendees?.length > 0 && (
              <Badge live>
                {nextMovie.attendees.length} attending
              </Badge>
            ))}
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
                  <Icon name={isHeroPlaying ? 'play' : 'calendar'} size={14} stroke={1.5} />
                  <span>
                    {isHeroPlaying
                      ? `Started ${formatDate(nowPlaying.started_at, 'time')}${heroEndsAt ? ` · ends ~${formatDate(heroEndsAt.toISOString(), 'time')}` : ''}`
                      : `${isHeroPast ? 'Watched' : 'Next'} · ${formatDate(heroMovie.scheduled_at, 'long')}`}
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
                  {/* RSVP only makes sense before the film starts — the Discord
                      card drops its button at start time for the same reason. */}
                  {heroState === 'upcoming' && isAuthenticated && (
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

                {!isHeroPast && heroAttendees.length > 0 && (
                  <div className="hero-attendees">
                    <div className="attendee-stack">
                      {heroAttendees.slice(0, 6).map((a) => (
                        <img
                          key={a.discord_id}
                          src={getAvatarUrl(a.discord_id, a.avatar)}
                          alt={a.username}
                          title={a.username}
                          className="attendee-avatar"
                          loading="lazy"
                        />
                      ))}
                      {heroAttendees.length > 6 && (
                        <span className="attendee-more">+{heroAttendees.length - 6}</span>
                      )}
                    </div>
                    <span className="attendee-label">
                      {heroAttendees.length} {isHeroPlaying ? 'watching' : 'confirmed'}
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

        {/* Tabbed sidebar: Announce + Board share the space */}
        <HomeSidebar
          isAuthenticated={isAuthenticated}
          loading={loading}
          onAnnounced={fetchData}
          onPick={setScheduleMovie}
          pickedMovie={scheduleMovie}
        />
      </section>

      {scheduleMovie && (
        <ScheduleSection
          movie={scheduleMovie}
          occupancy={calendar}
          onCancel={() => setScheduleMovie(null)}
          onScheduled={() => { setScheduleMovie(null); fetchData(); }}
        />
      )}

      {onThisDay && <OnThisDay movie={onThisDay} />}
      {stats && <HomeStatsBand stats={stats} seasonalKey={seasonal?.key || null} />}
      {stats && <HomeHallOfFame stats={stats} />}

      {/* ═══ Reviews — featured pull-quote ═══ */}
      {reviews.length > 0 && (
        <section className="home-block">
          <SectionHead num="02" title="Recent dispatches" meta={`${reviews.length} reviews`} />
          <ReviewsFeature reviews={reviews} />
        </section>
      )}

      {/* ═══ Upcoming + Best rated ═══ */}
      <div className="home-bottom">
        <section className="home-block">
          <SectionHead
            num="03"
            title={calendar.length > 0 ? 'On the calendar' : 'Last screenings'}
            meta={<Link to="/movies" className="btn text">Archive →</Link>}
          />
          {loading ? (
            <div className="upcoming-grid">
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
            </div>
          ) : (
            <OnTheCalendar
              items={calendarItems}
              fallback={
                <EmptyState
                  title="Nothing queued."
                  body="Announce a movie to start the next screening."
                />
              }
            />
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

      <UsersSection />

    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   Home sidebar — toggles between Announce and Board in the same slot.
   ═══════════════════════════════════════════════════════════════════════ */
function HomeSidebar({ isAuthenticated, loading, onAnnounced, onPick, pickedMovie }) {
  const [tab, setTab] = useState(isAuthenticated ? 'announce' : 'board');
  // Auth resolves after the first render, so the initial value above sees a
  // logged-in user as anonymous. Follow it until the user picks a tab themselves.
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (!picked) setTab(isAuthenticated ? 'announce' : 'board');
  }, [isAuthenticated, picked]);

  const choose = (next) => {
    setPicked(true);
    setTab(next);
  };

  return (
    <aside className="home-sidebar">
      <div className="hs-fill">
      <nav className="hs-tabs" role="tablist" aria-label="Home sidebar">
        <button
          role="tab"
          aria-selected={tab === 'announce'}
          className={`hs-tab ${tab === 'announce' ? 'active' : ''}`}
          onClick={() => choose('announce')}
        >
          <Icon name="megaphone" size={14} stroke={1.5} />
          <span>Announce</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'board'}
          className={`hs-tab ${tab === 'board' ? 'active' : ''}`}
          onClick={() => choose('board')}
        >
          <Icon name="star" size={14} stroke={1.5} />
          <span>Board</span>
        </button>
      </nav>

      <div className="hs-panel" role="tabpanel">
        {tab === 'announce' ? (
          isAuthenticated ? (
            <AnnounceFlow onPick={onPick} pickedMovie={pickedMovie} />
          ) : (
            <div className="hs-login">
              <div className="hs-login-eyebrow">Host the next night</div>
              <h3 className="hs-login-title">Want to schedule the next movie?</h3>
              <p>Log in with Discord and use this space to search a film, pick a date, and announce it to the club.</p>
            </div>
          )
        ) : (
          <SuggestionBoard onAnnounced={onAnnounced} />
        )}
      </div>
      </div>
    </aside>
  );
}

export default Home;
