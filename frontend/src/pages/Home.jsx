import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sanitizeImageUrl } from '../utils/sanitizeUrl';
import {
  getMovies,
  getActiveVoting,
  getNextMovieWithAttendees,
  getUpcomingMoviesWithAttendees
} from '../api/client';
import { StarRating, MovieCard, MovieCardSkeleton } from '../components/common';
import { AdminSettingsPanel, AnnounceFlow, NextMovieHero, VotingSection, CommentsTicker, UsersSection, ExploreSection } from '../components/home';
import './Home.css';

const Home = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [movies, setMovies] = useState([]);
  const [voting, setVoting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextMovieWithAttendees, setNextMovieWithAttendees] = useState(null);
  const [upcomingWithAttendees, setUpcomingWithAttendees] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [moviesData, votingData, nextMovieData, upcomingData] = await Promise.all([
        getMovies(100, 0),
        getActiveVoting().catch(() => null),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => [])
      ]);
      setMovies(moviesData);
      setVoting(votingData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
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

  const handleAttendanceChange = (updatedMovie) => {
    setNextMovieWithAttendees(updatedMovie);
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
  const topRatedMovie = bestRatedThisMonth[0];
  const backgroundImage = sanitizeImageUrl(topRatedMovie?.backdrop_url) || sanitizeImageUrl(topRatedMovie?.image_url);

  return (
    <div className="home">
      {backgroundImage && (
        <div
          className="home-background"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}

      {isAdmin && <AdminSettingsPanel onDataRefresh={handleDataRefresh} />}

      {isAuthenticated && <AnnounceFlow onAnnounced={handleDataRefresh} />}

      <div className="home-layout">
        <div className="home-hero-column">
          <NextMovieHero
            movie={nextMovie}
            loading={loading}
            onAttendanceChange={handleAttendanceChange}
          />
        </div>

        <div className="home-content-column">
          <VotingSection
            voting={voting}
            setVoting={setVoting}
            loading={loading}
            onDataRefresh={handleDataRefresh}
          />

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
                      <div className="skeleton" style={{ width: 30, height: 20 }} />
                      <div className="skeleton" style={{ width: 30, height: 45 }} />
                      <div className="best-rated-info">
                        <div className="skeleton" style={{ width: 100, height: 16 }} />
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
        </div>
      </div>

      <CommentsTicker />

      <ExploreSection />

      <UsersSection />
    </div>
  );
};

export default Home;
