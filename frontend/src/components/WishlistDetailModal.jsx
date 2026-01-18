import { useState } from 'react';
import { announceFromWishlist } from '../api/client';
import './WishlistDetailModal.css';

const WishlistDetailModal = ({ item, isOpen, onClose, onAnnounce, canAnnounce }) => {
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('20:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !item) return null;

  const today = new Date().toISOString().split('T')[0];

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

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();

    if (!scheduleDate || !scheduleTime) {
      setError('Please select both date and time');
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (scheduledAt <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await announceFromWishlist(item.id, scheduledAt.toISOString());
      if (onAnnounce) {
        onAnnounce(item);
      }
      // Reset form and close
      setShowScheduleForm(false);
      setScheduleDate('');
      setScheduleTime('20:00');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to schedule movie night');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setShowScheduleForm(false);
    setScheduleDate('');
    setScheduleTime('20:00');
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content wishlist-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Backdrop */}
        {item.backdrop_url && (
          <div className="detail-backdrop" style={{ backgroundImage: `url(${item.backdrop_url})` }}>
            <div className="detail-backdrop-overlay" />
          </div>
        )}

        <button className="modal-close" onClick={handleClose}>×</button>

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
              {showScheduleForm ? (
                <div className="schedule-inline-form">
                  <h4>Schedule Movie Night</h4>
                  <form onSubmit={handleScheduleSubmit}>
                    <div className="schedule-form-row">
                      <div className="schedule-form-field">
                        <label>Date</label>
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          min={today}
                          required
                        />
                      </div>
                      <div className="schedule-form-field">
                        <label>Time</label>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    {error && <div className="schedule-form-error">{error}</div>}
                    <div className="schedule-form-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setShowScheduleForm(false);
                          setError(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Scheduling...' : 'Schedule & Announce'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button className="btn-primary announce-btn" onClick={() => setShowScheduleForm(true)}>
                  Schedule Movie Night
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WishlistDetailModal;
