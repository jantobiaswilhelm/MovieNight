import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMovies } from '../api/client';
import MovieCard from '../components/MovieCard';
import './Home.css';

const Home = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMovies(100, 0)
      .then(setMovies)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading movies...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Upcoming movies (scheduled in the future)
  const upcomingMovies = movies
    .filter(movie => new Date(movie.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Best rated movies of this month
  const bestRatedThisMonth = movies
    .filter(movie => {
      const date = new Date(movie.scheduled_at);
      return date >= startOfMonth && date <= endOfMonth && parseFloat(movie.avg_rating) > 0;
    })
    .sort((a, b) => parseFloat(b.avg_rating) - parseFloat(a.avg_rating))
    .slice(0, 5);

  return (
    <div className="home">
      {/* Upcoming Movies Section */}
      <section className="home-section">
        <div className="section-header">
          <h2>Upcoming Movie Nights</h2>
          <Link to="/calendar" className="view-all">View Calendar &rarr;</Link>
        </div>

        {upcomingMovies.length === 0 ? (
          <div className="empty-state">
            <p>No upcoming movie nights scheduled.</p>
            <p>Use <code>/announce</code> in Discord to create one.</p>
          </div>
        ) : (
          <div className="movie-grid horizontal">
            {upcomingMovies.slice(0, 3).map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </section>

      {/* Best Rated This Month Section */}
      <section className="home-section">
        <div className="section-header">
          <h2>Best Rated This Month</h2>
          <Link to="/stats" className="view-all">View Stats &rarr;</Link>
        </div>

        {bestRatedThisMonth.length === 0 ? (
          <div className="empty-state">
            <p>No rated movies this month yet.</p>
          </div>
        ) : (
          <div className="best-rated-list">
            {bestRatedThisMonth.map((movie, index) => (
              <Link to={`/movie/${movie.id}`} key={movie.id} className="best-rated-item">
                <span className="rank">#{index + 1}</span>
                {movie.image_url && (
                  <img src={movie.image_url} alt="" className="best-rated-poster" />
                )}
                <div className="best-rated-info">
                  <span className="best-rated-title">{movie.title}</span>
                  <span className="best-rated-rating">{parseFloat(movie.avg_rating).toFixed(1)}/10</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Voting Section (Template) */}
      <section className="home-section voting-section">
        <div className="section-header">
          <h2>Vote for Next Movie</h2>
        </div>

        <div className="voting-placeholder">
          <div className="voting-card">
            <div className="voting-icon">🎬</div>
            <h3>Movie Voting Coming Soon</h3>
            <p>Soon you'll be able to suggest and vote for upcoming movie nights right here!</p>
            <div className="voting-preview">
              <div className="vote-option disabled">
                <span className="vote-title">Movie Suggestion 1</span>
                <div className="vote-bar">
                  <div className="vote-progress" style={{ width: '65%' }}></div>
                </div>
                <span className="vote-count">13 votes</span>
              </div>
              <div className="vote-option disabled">
                <span className="vote-title">Movie Suggestion 2</span>
                <div className="vote-bar">
                  <div className="vote-progress" style={{ width: '35%' }}></div>
                </div>
                <span className="vote-count">7 votes</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
