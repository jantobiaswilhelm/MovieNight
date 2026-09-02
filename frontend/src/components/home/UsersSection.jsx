import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getGuildUsers } from '../../api/client';
import { getAvatarUrl } from '../../utils/helpers';
import { SectionHead } from '../ui';
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
        <SectionHead num="05" title="Members" />
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

  return (
    <div className="users-section">
      <SectionHead num="05" title="Members" meta={`${users.length} raters`} />
      <div className={`users-grid ${expanded ? 'expanded' : ''}`}>
        {displayedUsers.map((user) => (
          <Link key={user.id} to={`/user/${user.id}`} className="user-item">
            <img
              src={getAvatarUrl(user.discord_id, user.avatar)}
              alt={user.username}
              className="user-avatar"
              loading="lazy"
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
