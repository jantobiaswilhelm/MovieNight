import { useEffect, useState } from 'react';
import * as api from '../../api/client';
import { Icon } from '../ui';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const fmtNight = (n) =>
  new Date(n.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Logs a film the group already watched outside the roll-out. Offers whatever past
// movie nights we can find for it, so the marathon ends up pointing at the real
// screening — and its ratings — rather than a date somebody typed. Falls back to a
// plain date for a film that was watched but never announced.
export default function MarkWatchedPanel({ marathonId, item, onDone, onCancel, onError }) {
  const [nights, setNights] = useState(null);    // null = still loading
  const [choice, setChoice] = useState('date');  // 'date', or a night id as a string
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api.getMarathonItemMatches(marathonId, item.id)
      .then((rows) => {
        if (!live) return;
        setNights(rows);
        // One obvious candidate is almost always the right one.
        if (rows.length === 1) setChoice(String(rows[0].id));
      })
      // A lookup failure shouldn't block logging the film by hand.
      .catch(() => { if (live) setNights([]); });
    return () => { live = false; };
  }, [marathonId, item.id]);

  const submit = async () => {
    const night = nights?.find((n) => String(n.id) === choice);
    const watchedAt = night ? new Date(night.scheduled_at) : new Date(when);
    if (isNaN(watchedAt.getTime())) { onError('Pick a date first.'); return; }
    if (watchedAt > new Date()) {
      onError('That date is in the future — pick when you actually watched it.');
      return;
    }
    setSaving(true);
    try {
      await api.markMarathonItemWatched(marathonId, item.id, watchedAt.toISOString(), night ? night.id : null);
      onDone();
    } catch (err) {
      onError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mara-watched">
      <div className="k">When did you watch “{item.title}”?</div>
      {nights === null ? (
        <p className="muted">Looking for past screenings…</p>
      ) : (
        <>
          {nights.map((n) => (
            <label key={n.id} className="wopt">
              <input type="radio" name={`watched-${item.id}`} checked={choice === String(n.id)}
                onChange={() => setChoice(String(n.id))} />
              <span>{fmtNight(n)}{n.announced_by_name ? ` — announced by ${n.announced_by_name}` : ''}</span>
            </label>
          ))}
          <label className="wopt">
            <input type="radio" name={`watched-${item.id}`} checked={choice === 'date'}
              onChange={() => setChoice('date')} />
            <span>{nights.length ? 'Another date' : 'Date watched'}</span>
            <input className="li-date" type="datetime-local" value={when} max={toLocalInput(new Date())}
              disabled={choice !== 'date'} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </>
      )}
      <div className="wact">
        <button className="btn" disabled={saving || nights === null} onClick={submit}>
          <Icon name="check-circle" size={15} /> Mark watched
        </button>
        <button className="btn ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
