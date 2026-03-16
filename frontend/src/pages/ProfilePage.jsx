import { Link, useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFollow, useFetch } from '../hooks';
import { getMyRatings, getMyProfileStats, getUserProfileStats, getUserRatings } from '../api/client';
import { RatingHistogram, GenreBreakdown, HotTakes, RatingTwin, FavoriteMovies, ProfileWishlist, TopRatedMovies } from '../components/profile';
import { formatDate, formatWatchtime, getAvatarUrl } from '../utils/helpers';
import './Profile.css';

const ProfilePage = () => {
  const { userId } = useParams();
  const { user: currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const isOwnProfile = !userId || (currentUser && currentUser.id === parseInt(userId));

  const { isFollowing, loading: followLoading, toggleFollow, checkStatus } = useFollow(
    userId,
    isAuthenticated && !isOwnProfile
  );

  const shouldFetch = isOwnProfile ? isAuthenticated : true;

  const { data, loading, error, setData } = useFetch(
    async () => {
      const [profileData, ratingsData] = await Promise.all([
        isOwnProfile ? getMyProfileStats() : getUserProfileStats(userId),
        isOwnProfile ? getMyRatings(100) : getUserRatings(userId, 20)
      ]);

      if (!isOwnProfile && isAuthenticated) {
        checkStatus();
      }

      return { profileStats: profileData, ratings: ratingsData };
    },
    [userId, isAuthenticated, isOwnProfile],
    { enabled: shouldFetch, initialData: { profileStats: null, ratings: [] } }
  );

  const { profileStats, ratings } = data;

  const handleFavoritesUpdate = () => {
    const fetchStats = isOwnProfile ? getMyProfileStats : () => getUserProfileStats(userId);
    fetchStats().then((profileData) => {
      setData((prev) => ({ ...prev, profileStats: profileData }));
    }).catch(console.error);
  };

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (isOwnProfile && !isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!isOwnProfile && !profileStats?.user) {
    return <div className="error">User not found</div>;
  }

  const profileUser = isOwnProfile ? currentUser : profileStats.user;
  const basicStats = isOwnProfile ? profileStats?.basic_stats : profileStats?.basic_stats;
  const guildComparison = isOwnProfile ? profileStats?.guild_comparison : profileStats?.guild_comparison;

  return (
    <div className="profile">
      <div className="user-profile-header">
        {!isOwnProfile && getAvatarUrl(profileUser.discord_id, profileUser.avatar) && (
          <img
            src={getAvatarUrl(profileUser.discord_id, profileUser.avatar)}
            alt={profileUser.username}
            className="user-profile-avatar"
            loading="lazy"
          />
        )}
        <div className="user-profile-header-content">
          <h1>{profileUser.username}'s Profile</h1>
          {isAuthenticated && !isOwnProfile && (
            <button
              className={`follow-btn ${isFollowing ? 'following' : ''}`}
              onClick={toggleFollow}
              disabled={followLoading}
            >
              {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
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
          {isOwnProfile && profileStats?.streak && profileStats.streak.current_streak > 0 && (
            <div className="profile-stat streak-stat">
              <span className="stat-value">
                <span className="streak-fire">&#x1F525;</span> {profileStats.streak.current_streak}
              </span>
              <span className="stat-label">Streak</span>
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
      {isOwnProfile ? (
        <div className="profile-section">
          <FavoriteMovies
            favorites={profileStats?.favorite_movies || []}
            onUpdate={handleFavoritesUpdate}
            isOwner={true}
          />
        </div>
      ) : profileStats?.favorite_movies?.length > 0 && (
        <div className="profile-section">
          <FavoriteMovies
            favorites={profileStats.favorite_movies}
            isOwner={false}
          />
        </div>
      )}

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
          {isOwnProfile && <RatingTwin twin={profileStats?.rating_twin} />}
          <HotTakes hotTakes={profileStats?.hot_takes} />
          {isOwnProfile && <ProfileWishlist wishlist={profileStats?.wishlist_preview} />}
        </div>
      </div>

      {/* Quick Links */}
      <div className="profile-section profile-links">
        <h2>Explore More</h2>
        <div className="profile-links-grid">
          <Link to="/movies" className="profile-link-card">All Movies</Link>
          <Link to="/achievements" className="profile-link-card">Achievements</Link>
          <Link to="/wishlist" className="profile-link-card">Wishlist</Link>
          <Link to="/stats" className="profile-link-card">Statistics</Link>
        </div>
      </div>

      {/* Rating History */}
      {ratings.length > 0 && (
        <div className="profile-section">
          <h2>{isOwnProfile ? 'Rating History' : 'Recent Ratings'}</h2>
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

      {isOwnProfile && ratings.length === 0 && (
        <div className="profile-section">
          <h2>Rating History</h2>
          <div className="empty-state">
            <p>You haven't rated any movies yet.</p>
            <p>Watch a movie night and rate it!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
