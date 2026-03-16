import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getActivityFeed, getMyFollowing } from '../api/client';
import { useFetch } from '../hooks';
import { formatRelativeTime, getAvatarUrl } from '../utils/helpers';
import './ActivityFeed.css';

const ActivityFeed = () => {
  const { isAuthenticated } = useAuth();

  const { data, loading, error } = useFetch(
    async () => {
      const [activityData, followingData] = await Promise.all([
        getActivityFeed(),
        getMyFollowing()
      ]);
      return { activities: activityData, following: followingData };
    },
    [isAuthenticated],
    { enabled: isAuthenticated, initialData: { activities: [], following: [] } }
  );

  const activities = data.activities;
  const following = data.following;

  const getActivityIcon = (type) => {
    const icons = {
      rated_movie: String.fromCodePoint(0x2B50),
      added_wishlist: String.fromCodePoint(0x1F4CB),
      created_list: String.fromCodePoint(0x1F4DD),
      achievement_unlocked: String.fromCodePoint(0x1F3C6)
    };
    return icons[type] || String.fromCodePoint(0x1F4AC);
  };

  const getActivityText = (activity) => {
    const data = activity.data || {};
    switch (activity.activity_type) {
      case 'rated_movie':
        return (
          <>
            rated {data.movieNightId
              ? <Link to={`/movie/${data.movieNightId}`}><strong>{data.movieTitle}</strong></Link>
              : <strong>{data.movieTitle}</strong>
            } {data.score}/10
          </>
        );
      case 'added_wishlist':
        return (
          <>
            added <strong>{data.movieTitle}</strong> to their <Link to="/wishlist">wishlist</Link>
          </>
        );
      case 'created_list':
        return (
          <>
            created a new list: {data.listId
              ? <Link to={`/lists/${data.listId}`}><strong>{data.listName}</strong></Link>
              : <strong>{data.listName}</strong>
            }
          </>
        );
      case 'achievement_unlocked':
        return (
          <>
            unlocked achievement: <strong>{data.achievementName}</strong>
          </>
        );
      default:
        return 'did something';
    }
  };

  if (loading) {
    return <div className="loading">Loading activity feed...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="activity-feed-page">
        <h1>Activity Feed</h1>
        <div className="empty-state">
          <p>Log in to see activity from people you follow.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="activity-feed-page">
      <h1>Activity Feed</h1>

      {following.length === 0 ? (
        <div className="empty-state">
          <p>You're not following anyone yet.</p>
          <p>Follow other users to see their activity here!</p>
          <Link to="/stats" className="btn-primary">
            Find Users
          </Link>
        </div>
      ) : activities.length === 0 ? (
        <div className="empty-state">
          <p>No recent activity from people you follow.</p>
        </div>
      ) : (
        <div className="activity-list">
          {activities.map((activity) => (
            <div key={activity.id} className="activity-item">
              <div className="activity-icon">{getActivityIcon(activity.activity_type)}</div>
              <div className="activity-content">
                <div className="activity-user">
                  <img
                    src={getAvatarUrl(activity.discord_id, activity.avatar)}
                    alt={activity.username}
                    className="activity-avatar"
                    loading="lazy"
                  />
                  <Link to={`/user/${activity.user_id}`} className="activity-username">
                    {activity.username}
                  </Link>
                </div>
                <div className="activity-text">{getActivityText(activity)}</div>
                <div className="activity-time">{formatRelativeTime(activity.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Following Sidebar */}
      {following.length > 0 && (
        <aside className="following-sidebar">
          <h3>Following ({following.length})</h3>
          <div className="following-list">
            {following.map((user) => (
              <Link key={user.id} to={`/user/${user.id}`} className="following-item">
                <img
                  src={getAvatarUrl(user.discord_id, user.avatar)}
                  alt={user.username}
                  className="following-avatar"
                  loading="lazy"
                />
                <span>{user.username}</span>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
};

export default ActivityFeed;
