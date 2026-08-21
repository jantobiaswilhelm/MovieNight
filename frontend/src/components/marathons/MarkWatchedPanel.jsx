import { useEffect, useState } from 'react';
import * as api from '../../api/client';
import { Icon } from '../ui';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Year and time both matter: a group that rewatches a film can have two screenings
// that read identically as "Sat, Mar 8", and picking the wrong one ties the marathon
// to the wrong night's ratings.
const fmtNight = (n) =>
  new Date(n.scheduled_at).toLocaleString(undefined,
    { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Logs a film the group already watched outside the roll-out. Offers whatever past
// movie nights we can find for it, so the marathon ends up pointing at the real
// screening — and its ratings — rather than a date somebody typed. Falls back to a
// plain date for a film that was watched but never announced.
//
// onDone must unmount this panel. The submit path deliberately leaves the buttons
// disabled once it succeeds, so a slow request can't be double-submitted.
export default function MarkWatchedPanel({ marathonId, item, onDone, onCancel, onError }) {
  const [nights, setNights] = useState(null);    // null = still loading
  const [choice, setChoice] = useState('date');  // 'date', or a night id as a string
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    // Reset first, so a reused instance can never offer the previous film's
    // screenings — or submit a night id that belongs to another film.
    setNights(null);
    setChoice('date');
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

  const headingId = `watched-h-${item.id}`;

  return (
    <div className="mara-watched">
      <div className="k" id={headingId}>When did you watch “{item.title}”?</div>
      {nights === null ? (
        <p className="muted">Looking for past screenings…</p>
      ) : (
        <>
          {nights.length > 0 && (
            <div className="wopts" role="radiogroup" aria-labelledby={headingId}>
              {nights.map((n) => (
                <label key={n.id} className="wopt">
                  <input type="radio" name={`watched-${item.id}`} checked={choice === String(n.id)}
                    onChange={() => setChoice(String(n.id))} />
                  {/* Show the night's own title when it differs: a film with no
                      tmdb_id is matched on a title prefix, so "Alien" can turn up
                      a screening of "Aliens". Confirming blind would tie this
                      marathon to another film's ratings. */}
                  <span>{fmtNight(n)}
                    {n.title && n.title !== item.title ? ` — ${n.title}` : ''}
                    {n.announced_by_name ? ` · announced by ${n.announced_by_name}` : ''}</span>
                </label>
              ))}
              <label className="wopt">
                <input type="radio" name={`watched-${item.id}`} checked={choice === 'date'}
                  onChange={() => setChoice('date')} />
                <span>Another date</span>
              </label>
            </div>
          )}
          {/* Outside the label on purpose: one label may name only one control, and
              disabling the field would make the obvious gesture — clicking the date
              — do nothing. Touching it selects its radio instead. */}
          <input className="li-date wdate" type="datetime-local" value={when}
            aria-label={nights.length ? 'Another date' : 'Date watched'}
            max={toLocalInput(new Date())}
            onFocus={() => setChoice('date')}
            onChange={(e) => { setWhen(e.target.value); setChoice('date'); }} />
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
