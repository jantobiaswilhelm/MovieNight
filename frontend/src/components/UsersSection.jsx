import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getGuildUsers } from '../api/client';
import './UsersSection.css';

const UsersSection = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await getGuildUsers();
        setUsers(data);
      } catch (err) {
        console.error('Error fetching users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="users-section">
        <h3>Members</h3>
        <div className="users-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="user-item user-skeleton">
              <div className="skeleton user-avatar-skeleton" />
              <div className="skeleton user-name-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return null;
  }

  const displayedUsers = expanded ? users : users.slice(0, 8);
  const hasMore = users.length > 8;

  const getAvatarUrl = (user) => {
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discord_id) % 5}.png`;
  };

  return (
    <div className="users-section">
      <div className="users-section-header">
        <h3>Members</h3>
        <span className="users-count">{users.length} raters</span>
      </div>
      <div className={`users-grid ${expanded ? 'expanded' : ''}`}>
        {displayedUsers.map((user) => (
          <Link key={user.id} to={`/user/${user.id}`} className="user-item">
            <img
              src={getAvatarUrl(user)}
              alt={user.username}
              className="user-avatar"
            />
            <span className="user-name">{user.username}</span>
            <span className="user-rating-count">{user.rating_count} ratings</span>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button
          className="users-expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : `Show All ${users.length} Members`}
        </button>
      )}
    </div>
  );
};

export default UsersSection;
