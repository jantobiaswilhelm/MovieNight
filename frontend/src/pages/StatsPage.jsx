import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api/client';
import Stats from '../components/Stats';
import './StatsPage.css';

const MovieList = ({ title, movies, emptyMessage }) => {
  if (!movies || movies.length === 0) {
    return (
      <div className="stats-list-section">
        <h3>{title}</h3>
        <p className="empty-message">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="stats-list-section">
      <h3>{title}</h3>
      <div className="movie-list">
        {movies.map((movie, index) => (
          <Link key={movie.id} to={`/movie/${movie.id}`} className="movie-list-item">
            <span className="rank">#{index + 1}</span>
            {movie.image_url && (
              <img src={movie.image_url} alt="" className="movie-thumb" />
            )}
            <div className="movie-info">
              <span className="movie-title">{movie.title}</span>
              <span className="movie-meta">{movie.rating_count} votes</span>
            </div>
            <span className="movie-rating">{parseFloat(movie.avg_rating).toFixed(1)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

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

      {/* Top Rated Section */}
      <section className="stats-section">
        <h2>Top Rated Movies</h2>
        <p className="section-note">Minimum 3 votes required</p>
        <div className="stats-grid-3">
          <MovieList
            title="This Month"
            movies={stats.top_month}
            emptyMessage="No movies with 3+ votes this month"
          />
          <MovieList
            title="This Year"
            movies={stats.top_year}
            emptyMessage="No movies with 3+ votes this year"
          />
          <MovieList
            title="All Time"
            movies={stats.top_all_time}
            emptyMessage="No movies with 3+ votes yet"
          />
        </div>
      </section>

      {/* Worst Rated Section */}
      <section className="stats-section">
        <h2>Worst Rated Movies</h2>
        <p className="section-note">Minimum 3 votes required</p>
        <div className="stats-grid-3">
          <MovieList
            title="This Month"
            movies={stats.worst_month}
            emptyMessage="No movies with 3+ votes this month"
          />
          <MovieList
            title="This Year"
            movies={stats.worst_year}
            emptyMessage="No movies with 3+ votes this year"
          />
          <MovieList
            title="All Time"
            movies={stats.worst_all_time}
            emptyMessage="No movies with 3+ votes yet"
          />
        </div>
      </section>

      {/* Top Raters Section */}
      <section className="stats-section">
        <div className="stats-grid-2">
          {stats.top_raters && stats.top_raters.length > 0 && (
            <div className="stats-list-section">
              <h3>Most Active Raters</h3>
              <div className="rater-list">
                {stats.top_raters.map((rater, index) => (
                  <div key={rater.discord_id} className="rater-item">
                    <span className="rank">#{index + 1}</span>
                    <div className="rater-info">
                      {rater.avatar && (
                        <img
                          src={`https://cdn.discordapp.com/avatars/${rater.discord_id}/${rater.avatar}.png`}
                          alt=""
                          className="rater-avatar"
                        />
                      )}
                      <span className="rater-name">{rater.username}</span>
                    </div>
                    <div className="rater-stats">
                      <span className="rater-count">{rater.rating_count} ratings</span>
                      <span className="rater-avg">avg: {parseFloat(rater.avg_rating).toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default StatsPage;
