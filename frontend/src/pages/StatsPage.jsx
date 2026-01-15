import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api/client';
import Stats from '../components/Stats';
import './StatsPage.css';

const StatsPage = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading stats...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="stats-page">
      <h1>Movie Night Stats</h1>

      <Stats stats={stats} />

      {stats.top_movies && stats.top_movies.length > 0 && (
        <section className="stats-section">
          <h2>Top Rated Movies</h2>
          <div className="top-list">
            {stats.top_movies.map((movie, index) => (
              <Link key={movie.id} to={`/movie/${movie.id}`} className="top-item">
                <span className="rank">#{index + 1}</span>
                <span className="name">{movie.title}</span>
                <span className="value">{parseFloat(movie.avg_rating).toFixed(1)}/10</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.top_raters && stats.top_raters.length > 0 && (
        <section className="stats-section">
          <h2>Most Active Raters</h2>
          <div className="top-list">
            {stats.top_raters.map((rater, index) => (
              <div key={rater.discord_id} className="top-item">
                <span className="rank">#{index + 1}</span>
                <div className="rater-info">
                  {rater.avatar && (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${rater.discord_id}/${rater.avatar}.png`}
                      alt=""
                      className="rater-avatar"
                    />
                  )}
                  <span className="name">{rater.username}</span>
                </div>
                <span className="value">
                  {rater.rating_count} ratings (avg: {parseFloat(rater.avg_rating).toFixed(1)})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StatsPage;
