import { Link, useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFollow, useFetch } from '../hooks';
import { getMyRatings, getMyProfileStats, getUserProfileStats, getUserRatings } from '../api/client';
import { RatingHistogram, GenreBreakdown, HotTakes, RatingTwin, FavoriteMovies, ProfileWishlist, TopRatedMovies } from '../components/profile';
import { formatDate, formatWatchtime, getAvatarUrl } from '../utils/helpers';
import { Icon, PageHeader, SectionHead, Stat, EmptyState } from '../components/ui';
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
      if (!isOwnProfile && isAuthenticated) checkStatus();
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

  if (authLoading) return <div className="loading">Loading…</div>;
  if (isOwnProfile && !isAuthenticated) return <Navigate to="/" replace />;
  if (loading) return <div className="loading">Loading profile…</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!isOwnProfile && !profileStats?.user) return <div className="error">User not found</div>;

  const profileUser = isOwnProfile ? currentUser : profileStats.user;
  const basicStats = profileStats?.basic_stats;
  const guildComparison = profileStats?.guild_comparison;
  const diff = basicStats && guildComparison
    ? (parseFloat(basicStats.avg_rating_given) - parseFloat(guildComparison.guild_avg)).toFixed(1)
    : null;

  return (
    <div className="pf-page">
      <header className="pf-hero">
        {getAvatarUrl(profileUser.discord_id, profileUser.avatar) && (
          <img
            src={getAvatarUrl(profileUser.discord_id, profileUser.avatar)}
            alt={profileUser.username}
            className="pf-avatar"
            loading="lazy"
          />
        )}
        <div className="pf-hero-body">
          <div className="pf-eyebrow">
            {isOwnProfile ? 'Your file' : 'A member file'}
          </div>
          <h1 className="pf-name">
            <em>{profileUser.username}</em>
          </h1>
          {basicStats && (
            <div className="pf-hero-meta">
              <span>{basicStats.total_ratings} rating{basicStats.total_ratings !== 1 ? 's' : ''}</span>
              <span className="sep" />
              <span>Avg {parseFloat(basicStats.avg_rating_given).toFixed(1)}</span>
              {profileStats?.watchtime && (
                <>
                  <span className="sep" />
                  <span>{formatWatchtime(profileStats.watchtime)}</span>
                </>
              )}
            </div>
          )}
        </div>
        {isAuthenticated && !isOwnProfile && (
          <button
            className={`btn ${isFollowing ? 'ghost' : ''}`}
            onClick={toggleFollow}
            disabled={followLoading}
          >
            {isFollowing
              ? <><Icon name="check" size={14} /> <span>Following</span></>
              : <><Icon name="plus" size={14} /> <span>Follow</span></>}
          </button>
        )}
      </header>

      {basicStats && (
        <section>
          <SectionHead num="01" title="The ledger" meta="By the numbers" />
          <div className="pf-stats">
            <Stat label="Ratings cast" value={basicStats.total_ratings} />
            <Stat
              label="Average given"
              value={parseFloat(basicStats.avg_rating_given).toFixed(1)}
              unit="/10"
              emphasis
            />
            {diff !== null && (
              <Stat
                label="vs The Club"
                value={`${diff >= 0 ? '+' : ''}${diff}`}
                caption={diff >= 0 ? 'generous' : 'stingy'}
              />
            )}
            {isOwnProfile && profileStats?.streak?.current_streak > 0 && (
              <Stat
                label="Current streak"
                value={profileStats.streak.current_streak}
                unit="screenings"
              />
            )}
            <Stat
              label="Highest verdict"
              value={parseFloat(basicStats.highest_rating).toFixed(1)}
              unit="/10"
            />
            <Stat
              label="Lowest verdict"
              value={parseFloat(basicStats.lowest_rating).toFixed(1)}
              unit="/10"
            />
          </div>
        </section>
      )}

      {(isOwnProfile || profileStats?.favorite_movies?.length > 0) && (
        <section className="pf-section">
          <FavoriteMovies
            favorites={profileStats?.favorite_movies || []}
            onUpdate={handleFavoritesUpdate}
            isOwner={isOwnProfile}
          />
        </section>
      )}

      <section className="pf-section">
        <TopRatedMovies movies={profileStats?.top_rated_movies} />
      </section>

      <section>
        <SectionHead num="02" title="The shape of their taste" meta="Breakdown" />
        <div className="pf-two-col">
          <div>
            <RatingHistogram histogram={profileStats?.histogram} />
            <GenreBreakdown genreStats={profileStats?.genre_stats} />
          </div>
          <div>
            {isOwnProfile && <RatingTwin twin={profileStats?.rating_twin} />}
            <HotTakes hotTakes={profileStats?.hot_takes} />
          </div>
        </div>
      </section>

      {isOwnProfile && (
        <section className="pf-section">
          <ProfileWishlist wishlist={profileStats?.wishlist_preview} />
        </section>
      )}

      <section>
        <SectionHead num="03" title="Elsewhere" meta="Quick links" />
        <div className="pf-links">
          <Link to="/movies" className="pf-link">
            <Icon name="film" size={16} stroke={1.5} />
            <span>The archive</span>
            <Icon name="arrow-right" size={14} className="pf-link-arrow" />
          </Link>
          <Link to="/achievements" className="pf-link">
            <Icon name="trophy" size={16} stroke={1.5} />
            <span>Achievements</span>
            <Icon name="arrow-right" size={14} className="pf-link-arrow" />
          </Link>
          <Link to="/wishlist" className="pf-link">
            <Icon name="bookmark" size={16} stroke={1.5} />
            <span>Wishlist</span>
            <Icon name="arrow-right" size={14} className="pf-link-arrow" />
          </Link>
          <Link to="/stats" className="pf-link">
            <Icon name="chart" size={16} stroke={1.5} />
            <span>Statistics</span>
            <Icon name="arrow-right" size={14} className="pf-link-arrow" />
          </Link>
        </div>
      </section>

      <section>
        <SectionHead
          num="04"
          title={isOwnProfile ? 'Your rating history' : 'Recent ratings'}
          meta={`${ratings.length} verdict${ratings.length !== 1 ? 's' : ''}`}
        />
        {ratings.length === 0 ? (
          <EmptyState
            icon={<Icon name="star" size={32} stroke={1.25} />}
            title={isOwnProfile ? "You haven't rated anything." : "No ratings yet."}
            body={isOwnProfile ? 'Watch a screening, rate it, and it\u2019ll show up here.' : 'Come back when this member posts their first verdict.'}
          />
        ) : (
          <ul className="pf-ratings">
            {ratings.map((rating) => (
              <li key={rating.id}>
                <Link to={`/movie/${rating.movie_night_id}`} className="pf-rating">
                  <span className="pf-rating-title">{rating.title}</span>
                  <span className="pf-rating-date">{formatDate(rating.scheduled_at)}</span>
                  <span className="pf-rating-score">
                    {parseFloat(rating.score).toFixed(1)}<sub>/10</sub>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ProfilePage;
