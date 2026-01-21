import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api/client';
import Stats from '../components/Stats';
import './StatsPage.css';

const formatMonth = (monthStr) => {
  if (!monthStr) return 'This Month';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

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
  const [selectedMonth, setSelectedMonth] = useState('');

  const fetchStats = async (month = null) => {
    setLoading(true);
    try {
      const data = await getStats(month);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleMonthChange = (e) => {
    const month = e.target.value;
    setSelectedMonth(month);
    fetchStats(month || null);
  };

  if (loading && !stats) {
    return <div className="loading">Loading stats...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const monthLabel = selectedMonth ? formatMonth(selectedMonth) : 'This Month';

  return (
    <div className="stats-page">
      <h1>Movie Night Stats</h1>

      <Stats stats={stats} />

      {/* Top Rated Section */}
      <section className="stats-section">
        <div className="section-header-row">
          <div>
            <h2>Top Rated Movies</h2>
            <p className="section-note">Minimum 3 votes required</p>
          </div>
        </div>
        <div className="stats-grid-3">
          <div className="stats-list-section">
            <div className="month-header">
              <select
                value={selectedMonth}
                onChange={handleMonthChange}
                className="month-select"
              >
                <option value="">This Month</option>
                {stats.available_months?.map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            {stats.top_month && stats.top_month.length > 0 ? (
              <div className="movie-list">
                {stats.top_month.map((movie, index) => (
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
            ) : (
              <p className="empty-message">No movies with 3+ votes for {monthLabel.toLowerCase()}</p>
            )}
          </div>
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
          <div className="stats-list-section">
            <h3>{monthLabel}</h3>
            {stats.worst_month && stats.worst_month.length > 0 ? (
              <div className="movie-list">
                {stats.worst_month.map((movie, index) => (
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
            ) : (
              <p className="empty-message">No movies with 3+ votes for {monthLabel.toLowerCase()}</p>
            )}
          </div>
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
      {stats.top_raters && stats.top_raters.length > 0 && (
        <section className="stats-section">
          <h2>Most Active Raters</h2>
          <div className="raters-grid">
            {stats.top_raters.map((rater, index) => (
              <Link key={rater.discord_id} to={`/user/${rater.id}`} className="rater-card">
                <span className="rank">#{index + 1}</span>
                <img
                  src={rater.avatar
                    ? `https://cdn.discordapp.com/avatars/${rater.discord_id}/${rater.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(rater.discord_id) % 5}.png`
                  }
                  alt=""
                  className="rater-avatar"
                />
                <span className="rater-name">{rater.username}</span>
                <div className="rater-stats">
                  <span className="rater-count">{rater.rating_count} ratings</span>
                  <span className="rater-avg">avg: {parseFloat(rater.avg_rating).toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StatsPage;
