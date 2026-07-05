import { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { updateWishlistImportance, removeFromWishlist } from '../../api/client';
import { getAvatarUrl } from '../../utils/helpers';
import './WishlistCard.css';

const ImportanceStars = ({ value, editable, onChange }) => {
  const [hoverValue, setHoverValue] = useState(0);

  const handleClick = (starValue) => {
    if (editable && onChange) {
      onChange(starValue);
    }
  };

  const displayValue = hoverValue || value;

  return (
    <div
      className={`importance-stars ${editable ? 'editable' : ''}`}
      onMouseLeave={() => setHoverValue(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`importance-star ${star <= displayValue ? 'filled' : ''}`}
          onClick={() => handleClick(star)}
          onMouseEnter={() => editable && setHoverValue(star)}
        >
          ★
        </span>
      ))}
    </div>
  );
};

const WishlistCard = ({ item, isOwner, showUser, onUpdate, onRemove, onClick }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const confirm = useConfirm();

  const handleCardClick = (e) => {
    // Don't trigger if clicking on interactive elements
    if (e.target.closest('.wishlist-remove-btn') || e.target.closest('.importance-stars')) {
      return;
    }
    if (onClick) {
      onClick(item);
    }
  };

  const handleImportanceChange = async (newImportance) => {
    if (newImportance === item.importance) return;

    setIsUpdating(true);
    try {
      await updateWishlistImportance(item.id, newImportance);
      if (onUpdate) {
        onUpdate({ ...item, importance: newImportance });
      }
    } catch (err) {
      console.error('Failed to update importance:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!(await confirm({ title: 'Remove from wishlist?', message: `Remove "${item.title}" from wishlist?`, confirmLabel: 'Remove', danger: true }))) return;

    setIsUpdating(true);
    try {
      await removeFromWishlist(item.id);
      if (onRemove) {
        onRemove(item.id);
      }
    } catch (err) {
      console.error('Failed to remove from wishlist:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className={`wishlist-card ${isUpdating ? 'updating' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={handleCardClick}
    >
      {isOwner && (
        <button
          className="wishlist-remove-btn"
          onClick={handleRemove}
          disabled={isUpdating}
          title="Remove from wishlist"
        >
          ×
        </button>
      )}

      <div className="wishlist-poster">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} loading="lazy" />
        ) : (
          <div className="no-poster">No Poster</div>
        )}
      </div>

      <div className="wishlist-info">
        <h3 className="wishlist-title">{item.title}</h3>

        <div className="wishlist-meta">
          {item.release_year && <span className="wishlist-year">{item.release_year}</span>}
          {item.genres && <span className="wishlist-genres">{item.genres}</span>}
        </div>

        <div className="wishlist-importance">
          <span className="importance-label">Priority:</span>
          <ImportanceStars
            value={item.importance}
            editable={isOwner}
            onChange={handleImportanceChange}
          />
        </div>

        {showUser && (
          <div className="wishlist-user">
            {getAvatarUrl(item.discord_id, item.avatar) && (
              <img src={getAvatarUrl(item.discord_id, item.avatar)} alt={item.username} className="wishlist-user-avatar" loading="lazy" />
            )}
            <span className="wishlist-username">{item.username}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistCard;
