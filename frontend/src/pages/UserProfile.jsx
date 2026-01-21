import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getUserProfileStats, getUserRatings } from '../api/client';
import RatingHistogram from '../components/RatingHistogram';
import GenreBreakdown from '../components/GenreBreakdown';
import HotTakes from '../components/HotTakes';
import FavoriteMovies from '../components/FavoriteMovies';
import './Profile.css';

const UserProfile = () => {
  const { userId } = useParams();
  const [profileStats, setProfileStats] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileData, ratingsData] = await Promise.all([
          getUserProfileStats(userId),
          getUserRatings(userId, 20)
        ]);
        setProfileStats(profileData);
        setRatings(ratingsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!profileStats?.user) {
    return <div className="error">User not found</div>;
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

  const { user, basic_stats: basicStats, guild_comparison: guildComparison } = profileStats;

  const getAvatarUrl = () => {
    if (!user.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png`;
  };

  return (
    <div className="profile">
      <div className="user-profile-header">
        {getAvatarUrl() && (
          <img src={getAvatarUrl()} alt={user.username} className="user-profile-avatar" />
        )}
        <h1>{user.username}'s Profile</h1>
      </div>

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

      {/* Favorite Movies Section (read-only) */}
      {profileStats?.favorite_movies?.length > 0 && (
        <div className="profile-section">
          <FavoriteMovies
            favorites={profileStats.favorite_movies}
            isOwner={false}
          />
        </div>
      )}

      {/* Two Column Layout */}
      <div className="profile-grid">
        <div className="profile-column">
          <RatingHistogram histogram={profileStats?.histogram} />
          <GenreBreakdown genreStats={profileStats?.genre_stats} />
        </div>
        <div className="profile-column">
          <HotTakes hotTakes={profileStats?.hot_takes} />
        </div>
      </div>

      {/* Recent Ratings */}
      {ratings.length > 0 && (
        <div className="profile-section">
          <h2>Recent Ratings</h2>
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
        </div>
      )}
    </div>
  );
};

export default UserProfile;
