import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyRatings, getMyProfileStats } from '../api/client';
import RatingHistogram from '../components/RatingHistogram';
import GenreBreakdown from '../components/GenreBreakdown';
import HotTakes from '../components/HotTakes';
import RatingTwin from '../components/RatingTwin';
import FavoriteMovies from '../components/FavoriteMovies';
import ProfileWishlist from '../components/ProfileWishlist';
import TopRatedMovies from '../components/TopRatedMovies';
import './Profile.css';

const Profile = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [ratings, setRatings] = useState([]);
  const [profileStats, setProfileStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const [ratingsData, profileData] = await Promise.all([
        getMyRatings(100),
        getMyProfileStats()
      ]);
      setRatings(ratingsData);
      setProfileStats(profileData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  const handleFavoritesUpdate = () => {
    // Refetch profile stats to update favorites
    getMyProfileStats().then(setProfileStats).catch(console.error);
  };

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <div className="loading">Loading your profile...</div>;
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

  const formatWatchtime = (minutes) => {
    if (!minutes) return '0h';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const basicStats = profileStats?.basic_stats;
  const guildComparison = profileStats?.guild_comparison;

  return (
    <div className="profile">
      <h1>{user.username}'s Profile</h1>

      {/* Stats Row */}
      {basicStats && (
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-value">{basicStats.total_ratings}</span>
            <span className="stat-label">Rated</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">
              {parseFloat(basicStats.avg_rating_given).toFixed(1)}
            </span>
            <span className="stat-label">Avg Rating</span>
          </div>
          {guildComparison && (
            <div className="profile-stat">
              <span className={`stat-value ${parseFloat(basicStats.avg_rating_given) > parseFloat(guildComparison.guild_avg) ? 'higher' : 'lower'}`}>
                {parseFloat(basicStats.avg_rating_given) > parseFloat(guildComparison.guild_avg) ? '+' : ''}
                {(parseFloat(basicStats.avg_rating_given) - parseFloat(guildComparison.guild_avg)).toFixed(1)}
              </span>
              <span className="stat-label">vs Server</span>
            </div>
          )}
          <div className="profile-stat">
            <span className="stat-value">{formatWatchtime(profileStats?.watchtime)}</span>
            <span className="stat-label">Watchtime</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">{parseFloat(basicStats.highest_rating).toFixed(1)}</span>
            <span className="stat-label">Highest</span>
          </div>
          <div className="profile-stat">
            <span className="stat-value">{parseFloat(basicStats.lowest_rating).toFixed(1)}</span>
            <span className="stat-label">Lowest</span>
          </div>
        </div>
      )}

      {/* Favorite Movies Section */}
      <div className="profile-section">
        <FavoriteMovies
          favorites={profileStats?.favorite_movies || []}
          onUpdate={handleFavoritesUpdate}
          isOwner={true}
        />
      </div>

      {/* Top 10 Movies Section */}
      <div className="profile-section">
        <TopRatedMovies movies={profileStats?.top_rated_movies} />
      </div>

      {/* Two Column Layout */}
      <div className="profile-grid">
        <div className="profile-column">
          <RatingHistogram histogram={profileStats?.histogram} />
          <GenreBreakdown genreStats={profileStats?.genre_stats} />
        </div>
        <div className="profile-column">
          <RatingTwin twin={profileStats?.rating_twin} />
          <HotTakes hotTakes={profileStats?.hot_takes} />
          <ProfileWishlist wishlist={profileStats?.wishlist_preview} />
        </div>
      </div>

      {/* Rating History */}
      <div className="profile-section">
        <h2>Rating History</h2>
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
    </div>
  );
};

export default Profile;
