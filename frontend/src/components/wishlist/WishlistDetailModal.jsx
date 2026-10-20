import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../../utils/sanitizeUrl';
import { formatRuntime, getLanguageName, getAvatarUrl } from '../../utils/helpers';
import { Icon } from '../ui';
import './WishlistDetailModal.css';

const WishlistDetailModal = ({ item, isOpen, onClose, onSchedule, canAnnounce }) => {
  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wishlist-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Backdrop */}
        {sanitizeImageUrl(item.backdrop_url) && (
          <div className="detail-backdrop" style={{ backgroundImage: `url(${sanitizeImageUrl(item.backdrop_url)})` }}>
            <div className="detail-backdrop-overlay" />
          </div>
        )}

        <button className="modal-close" onClick={onClose}>×</button>

        <div className="detail-content">
          <div className="detail-header">
            {item.image_url && (
              <img src={item.image_url} alt={item.title} className="detail-poster" loading="lazy" />
            )}

            <div className="detail-info">
              <h2>{item.title}</h2>

              <div className="detail-meta">
                {item.release_year && <span>{item.release_year}</span>}
                {item.runtime && <span>{formatRuntime(item.runtime)}</span>}
                {item.original_language && <span>{getLanguageName(item.original_language)}</span>}
              </div>

              {item.genres && (
                <div className="detail-genres">
                  {item.genres.split(', ').map((genre, i) => (
                    <span key={i} className="genre-tag">{genre}</span>
                  ))}
                </div>
              )}

              <div className="detail-ratings">
                {item.tmdb_rating > 0 && (
                  <div className="tmdb-rating">
                    <span className="tmdb-label">TMDB</span>
                    <span className="tmdb-score">{parseFloat(item.tmdb_rating).toFixed(1)}</span>
                  </div>
                )}
                <div className="importance-display">
                  <span className="importance-label">Priority:</span>
                  <span className="importance-stars-display">
                    {'★'.repeat(item.importance)}{'☆'.repeat(5 - item.importance)}
                  </span>
                </div>
              </div>

              <div className="detail-links">
                {sanitizeImdbId(item.imdb_id) && (
                  <a
                    href={`https://www.imdb.com/title/${sanitizeImdbId(item.imdb_id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="detail-link imdb-link"
                  >
                    IMDb
                  </a>
                )}
                {item.trailer_url && (
                  <a
                    href={sanitizeUrl(item.trailer_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="detail-link trailer-link"
                  >
                    Watch Trailer
                  </a>
                )}
              </div>

              <div className="detail-added-by">
                {getAvatarUrl(item.discord_id, item.avatar) && (
                  <img src={getAvatarUrl(item.discord_id, item.avatar)} alt={item.username} className="added-by-avatar" loading="lazy" />
                )}
                <span>Added by {item.username}</span>
              </div>
            </div>
          </div>

          {item.description && (
            <div className="detail-description">
              <h3>Overview</h3>
              <p>{item.description}</p>
            </div>
          )}

          {canAnnounce && (
            <div className="detail-actions">
              <button className="btn announce-btn" onClick={() => onSchedule(item)}>
                <Icon name="calendar" size={16} />
                <span>Schedule a screening</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WishlistDetailModal;
