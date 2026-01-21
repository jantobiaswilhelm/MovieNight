import { Link } from 'react-router-dom';
import './RatingTwin.css';

const RatingTwin = ({ twin }) => {
  const getAvatarUrl = () => {
    if (!twin?.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${twin.discord_id}/${twin.avatar}.png`;
  };

  if (!twin) {
    return (
      <div className="rating-twin">
        <h3>Rating Twin</h3>
        <div className="rating-twin-empty">
          <p>No rating twin found yet</p>
          <p className="rating-twin-hint">Need 5+ shared movies with another user</p>
        </div>
      </div>
    );
  }

  const correlationPercent = Math.round(parseFloat(twin.correlation) * 100);

  return (
    <div className="rating-twin">
      <h3>Rating Twin</h3>
      <Link to={`/user/${twin.user_id}`} className="rating-twin-card">
        <div className="rating-twin-avatar">
          {getAvatarUrl() ? (
            <img src={getAvatarUrl()} alt={twin.username} />
          ) : (
            <div className="no-avatar">{twin.username[0].toUpperCase()}</div>
          )}
        </div>
        <div className="rating-twin-info">
          <span className="rating-twin-name">{twin.username}</span>
          <span className="rating-twin-shared">{twin.shared_count} movies in common</span>
        </div>
        <div className="rating-twin-match">
          <span className="match-percent">{correlationPercent}%</span>
          <span className="match-label">match</span>
        </div>
      </Link>
      <p className="rating-twin-description">
        User with most similar rating patterns
      </p>
    </div>
  );
};

export default RatingTwin;
