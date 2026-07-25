import { useState } from 'react';
import { rescheduleMovie, unscheduleMovie } from '../../api/client';
import { formatDate } from '../../utils/helpers';
import { Modal, TimePicker } from '../ui';
import './RescheduleModal.css';

/** Format a Date as YYYY-MM-DD in the browser's local timezone (never UTC). */
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Format a Date as HH:MM in the browser's local timezone. */
const localTimeStr = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Modal to move an upcoming movie night to a new date/time. Prefilled with the
 * current schedule. Calls PATCH /movies/:id/reschedule (backend enforces
 * host-or-admin + not-started), then hands the updated row back via onRescheduled.
 */
const RescheduleModal = ({ movie, isOpen, onClose, onRescheduled }) => {
  const initial = movie?.scheduled_at ? new Date(movie.scheduled_at) : new Date();
  const [date, setDate] = useState(() => localDateStr(initial));
  const [time, setTime] = useState(() => localTimeStr(initial));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !movie) return null;

  const today = localDateStr(new Date());

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
      const updated = await rescheduleMovie(movie.id, scheduledAt.toISOString());
      if (onRescheduled) onRescheduled(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to reschedule movie night');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnschedule = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await unscheduleMovie(movie.id);
      if (onRescheduled) onRescheduled(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to clear the date');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reschedule" size="sm">
      <p className="reschedule-current">
        <strong>{movie.title}</strong>{' '}
        {movie.scheduled_at
          ? <>is currently set for {formatDate(movie.scheduled_at, 'long')}.</>
          : <>has no date yet — it&rsquo;s currently <b>TBD</b>.</>}
      </p>

      <form onSubmit={handleSubmit} className="announce-form">
        <div className="form-group">
          <label htmlFor="rs-date">New date</label>
          <input
            type="date"
            id="rs-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={today}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="rs-time">New time</label>
          <TimePicker id="rs-time" value={time} onChange={setTime} />
        </div>

        {error && <div className="form-error">{error}</div>}

        <p className="announce-note">
          Updates the time everywhere and posts a note in the Discord channel.
        </p>

        <div className="reschedule-actions">
          <button type="submit" className="btn-primary submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Rescheduling…' : 'Reschedule'}
          </button>
          {movie.scheduled_at && (
            <button type="button" className="btn ghost" disabled={isSubmitting} onClick={handleUnschedule}>
              Make TBD
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default RescheduleModal;
