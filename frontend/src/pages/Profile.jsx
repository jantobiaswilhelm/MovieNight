import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyRatings, getMyStats } from '../api/client';
import './Profile.css';

const Profile = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      try {
        const [ratingsData, statsData] = await Promise.all([
          getMyRatings(),
          getMyStats()
        ]);
        setRatings(ratingsData);
        setStats(statsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <div className="loading">Loading your ratings...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="profile">
      <h1>{user.username}'s Ratings</h1>

      {stats && (
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-value">{stats.total_ratings}</span>
            <span className="stat-label">Movies Rated</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">
              {parseFloat(stats.avg_rating_given).toFixed(1)}
            </span>
            <span className="stat-label">Avg Rating</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">{parseFloat(stats.highest_rating).toFixed(1)}</span>
            <span className="stat-label">Highest</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">{parseFloat(stats.lowest_rating).toFixed(1)}</span>
            <span className="stat-label">Lowest</span>
          </div>
        </div>
      )}

      {ratings.length === 0 ? (
        <div className="empty-state">
          <p>You haven't rated any movies yet.</p>
          <p>Watch a movie night and rate it!</p>
        </div>
      ) : (
        <div className="ratings-table">
          <div className="ratings-header">
            <span>Movie</span>
            <span>Date</span>
            <span>Rating</span>
          </div>
          {ratings.map((rating) => (
            <Link
              key={rating.id}
              to={`/movie/${rating.movie_night_id}`}
              className="rating-row"
            >
              <span className="rating-title">{rating.title}</span>
              <span className="rating-date">{formatDate(rating.scheduled_at)}</span>
              <span className="rating-score">{parseFloat(rating.score).toFixed(1)}/10</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Profile;
