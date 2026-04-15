import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getActivityFeed, getMyFollowing } from '../api/client';
import { useFetch } from '../hooks';
import { formatRelativeTime, getAvatarUrl } from '../utils/helpers';
import { Icon, PageHeader, EmptyState } from '../components/ui';
import './ActivityFeed.css';

const ACTIVITY_ICON = {
  rated_movie: 'star',
  added_wishlist: 'bookmark',
  created_list: 'list',
  achievement_unlocked: 'trophy'
};

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

  const getActivityText = (activity) => {
    const data = activity.data || {};
    switch (activity.activity_type) {
      case 'rated_movie':
        return (
          <>
            rated {data.movieNightId
              ? <Link to={`/movie/${data.movieNightId}`}><em>{data.movieTitle}</em></Link>
              : <em>{data.movieTitle}</em>
            } <span className="af-score">{data.score}<sub>/10</sub></span>
          </>
        );
      case 'added_wishlist':
        return <>added <em>{data.movieTitle}</em> to their <Link to="/wishlist">wishlist</Link></>;
      case 'created_list':
        return (
          <>
            created a new list: {data.listId
              ? <Link to={`/lists/${data.listId}`}><em>{data.listName}</em></Link>
              : <em>{data.listName}</em>
            }
          </>
        );
      case 'achievement_unlocked':
        return <>unlocked <em>{data.achievementName}</em></>;
      default:
        return 'did something';
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  if (!isAuthenticated) {
    return (
      <div className="af-page">
        <PageHeader eyebrow="The lobby" title={<>Around the <em>lobby.</em></>} />
        <EmptyState
          icon={<Icon name="user" size={32} stroke={1.25} />}
          title="Log in to see activity."
          body="Follow other members to see their ratings, lists and achievements here."
        />
      </div>
    );
  }

  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="af-page">
      <PageHeader
        eyebrow="The lobby"
        title={<>Around the <em>lobby.</em></>}
        meta={[
          `${following.length} following`,
          activities.length ? `${activities.length} recent` : 'quiet week'
        ]}
      />

      <div className="af-grid">
        <main className="af-main">
          {following.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" size={32} stroke={1.25} />}
              title="Nobody to watch yet."
              body="Find people to follow on the stats leaderboards — their activity will show up here."
              action={<Link to="/stats" className="btn">Find users</Link>}
            />
          ) : activities.length === 0 ? (
            <EmptyState
              title="Quiet this week."
              body="No recent activity from the people you follow. Check back later."
            />
          ) : (
            <ul className="af-list">
              {activities.map((activity) => (
                <li key={activity.id} className="af-item">
                  <img
                    src={getAvatarUrl(activity.discord_id, activity.avatar)}
                    alt={activity.username}
                    className="af-avatar"
                    loading="lazy"
                  />
                  <div className="af-body">
                    <div className="af-line">
                      <Link to={`/user/${activity.user_id}`} className="af-user">
                        {activity.username}
                      </Link>
                      <span className="af-text">{getActivityText(activity)}</span>
                    </div>
                    <div className="af-meta">
                      <Icon
                        name={ACTIVITY_ICON[activity.activity_type] || 'comment'}
                        size={12}
                        stroke={1.5}
                      />
                      <span>{formatRelativeTime(activity.created_at)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>

        {following.length > 0 && (
          <aside className="af-rail">
            <h4>Following · {following.length}</h4>
            <ul>
              {following.map((user) => (
                <li key={user.id}>
                  <Link to={`/user/${user.id}`} className="af-follow">
                    <img
                      src={getAvatarUrl(user.discord_id, user.avatar)}
                      alt={user.username}
                      loading="lazy"
                    />
                    <span>{user.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
