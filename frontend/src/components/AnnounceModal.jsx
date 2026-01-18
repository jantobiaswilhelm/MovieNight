import { useState } from 'react';
import { announceFromWishlist } from '../api/client';
import './AnnounceModal.css';

const AnnounceModal = ({ item, isOpen, onClose, onAnnounced }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !item) return null;

  // Get today's date in YYYY-MM-DD format for min attribute
  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!date || !time) {
      setError('Please select both date and time');
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await announceFromWishlist(item.id, scheduledAt.toISOString());
      if (onAnnounced) {
        onAnnounced(item);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to schedule movie night');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content announce-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedule Movie Night</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="announce-movie-preview">
            {item.image_url && (
              <img src={item.image_url} alt={item.title} className="preview-poster" />
            )}
            <div className="preview-info">
              <h3>{item.title}</h3>
              {item.release_year && <span className="preview-year">{item.release_year}</span>}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="announce-form">
            <div className="form-group">
              <label htmlFor="date">Date</label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="time">Time</label>
              <input
                type="time"
                id="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            <p className="announce-note">
              The bot will announce this movie in the Discord channel.
            </p>

            <button
              type="submit"
              className="btn-primary submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule & Announce'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AnnounceModal;
