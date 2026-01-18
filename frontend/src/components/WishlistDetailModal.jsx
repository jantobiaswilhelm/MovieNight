import { useState } from 'react';
import './WishlistDetailModal.css';

const WishlistDetailModal = ({ item, isOpen, onClose, onAnnounce, canAnnounce }) => {
  if (!isOpen || !item) return null;

  const formatRuntime = (minutes) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getLanguageName = (code) => {
    const languages = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      ja: 'Japanese', ko: 'Korean', zh: 'Chinese', pt: 'Portuguese', ru: 'Russian',
      hi: 'Hindi', ar: 'Arabic', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian',
      da: 'Danish', fi: 'Finnish', pl: 'Polish', tr: 'Turkish', th: 'Thai'
    };
    return languages[code] || code?.toUpperCase();
  };

  const getAvatarUrl = () => {
    if (!item.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${item.discord_id}/${item.avatar}.png`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wishlist-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Backdrop */}
        {item.backdrop_url && (
          <div className="detail-backdrop" style={{ backgroundImage: `url(${item.backdrop_url})` }}>
            <div className="detail-backdrop-overlay" />
          </div>
        )}

        <button className="modal-close" onClick={onClose}>×</button>

        <div className="detail-content">
          <div className="detail-header">
            {item.image_url && (
              <img src={item.image_url} alt={item.title} className="detail-poster" />
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
                {item.imdb_id && (
                  <a
                    href={`https://www.imdb.com/title/${item.imdb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="detail-link imdb-link"
                  >
                    IMDb
                  </a>
                )}
                {item.trailer_url && (
                  <a
                    href={item.trailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="detail-link trailer-link"
                  >
                    Watch Trailer
                  </a>
                )}
              </div>

              <div className="detail-added-by">
                {getAvatarUrl() && (
                  <img src={getAvatarUrl()} alt="" className="added-by-avatar" />
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
              <button className="btn-primary announce-btn" onClick={() => onAnnounce(item)}>
                Schedule Movie Night
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WishlistDetailModal;
