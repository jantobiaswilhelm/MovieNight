import { useState, useEffect, useRef } from 'react';
import { announceMovie } from '../../api/client';
import { Icon, Chip, TimePicker } from '../ui';
import InlineScheduler from './InlineScheduler';
import './ScheduleSection.css';

/**
 * Full-width schedule step: pick an open night on a roomy month calendar, then
 * an inline compose row (time + Schedule it) announces via the existing path.
 * Rendered by Home below the hero once AnnounceFlow reports a picked movie.
 */
export default function ScheduleSection({ movie, occupancy = [], onScheduled, onCancel }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [time, setTime] = useState('20:30');
  const [announcing, setAnnouncing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const ref = useRef(null);

  // Bring the calendar into view when a movie is picked.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const schedule = async () => {
    if (!selectedDay || !time) { setError('Pick a day and time.'); return; }
    const [hh, mm] = time.split(':').map(Number);
    const scheduledAt = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), hh, mm);
    if (scheduledAt <= new Date()) { setError('The time must be in the future.'); return; }
    setAnnouncing(true); setError(null);
    try {
      await announceMovie(movie, scheduledAt.toISOString());
      setDone(true);
      setTimeout(() => onScheduled && onScheduled(), 1400);
    } catch (err) {
      setError(err.message || 'Failed to announce movie');
    } finally {
      setAnnouncing(false);
    }
  };

  if (done) {
    return (
      <section className="sched-section">
        <div className="sched-done">
          <div className="sched-done-check"><Icon name="check" size={28} stroke={2} /></div>
          <h4>It&rsquo;s on the calendar.</h4>
          <p><em>{movie.title}</em> is announced. Updating…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sched-section" ref={ref}>
      <div className="sched-head">
        <div className="mara-eyebrow">Schedule a movie</div>
        <button type="button" className="btn text" onClick={onCancel}>
          <Icon name="arrow-left" size={14} /> Choose a different movie
        </button>
      </div>

      <div className="sched-body">
        <aside className="sched-movie">
          {movie.posterPath && <img src={movie.posterPath} alt={movie.title} className="sched-poster" loading="lazy" />}
          <h3>{movie.title}</h3>
          <div className="sched-meta">
            {movie.year && <span>{movie.year}</span>}
            {movie.runtime > 0 && <span>· {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
            {movie.rating > 0 && <span>· TMDB {movie.rating}</span>}
          </div>
          {movie.genres && (
            <div className="sched-chips">
              {movie.genres.split(', ').slice(0, 3).map((g, i) => (
                <Chip key={i} variant={i === 0 ? 'accent' : 'default'}>{g}</Chip>
              ))}
            </div>
          )}
        </aside>

        <div className="sched-cal">
          <InlineScheduler
            occupancy={occupancy}
            value={selectedDay}
            onChange={setSelectedDay}
            renderCompose={(day) => {
              const [hh, mm] = time.split(':').map(Number);
              const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, mm || 0);
              const timeLabel = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
              return (
                <div className="sched-compose">
                  <div className="sched-compose-lead">
                    <div className="sched-datechip">
                      <span className="d">{day.getDate()}</span>
                      <span className="mo">{day.toLocaleDateString(undefined, { month: 'short' })}</span>
                    </div>
                    <div className="sched-compose-info">
                      <div className="dow">{day.toLocaleDateString(undefined, { weekday: 'long' })}</div>
                      <div className="ttl">{movie.title}</div>
                      <div className="at"><Icon name="clock" size={13} /> {timeLabel}</div>
                    </div>
                  </div>
                  <div className="sched-compose-controls">
                    <label className="af-field">
                      <span>Time</span>
                      <TimePicker value={time} onChange={setTime} />
                    </label>
                    <button type="button" className="btn lg" onClick={schedule} disabled={announcing}>
                      {announcing ? 'Scheduling…' : <><Icon name="calendar" size={15} /> Schedule it</>}
                    </button>
                  </div>
                </div>
              );
            }}
          />
          {error && <div className="af-error" style={{ marginTop: 12 }}>{error}</div>}
          {!selectedDay && (
            <p className="sched-hint">Pick an open night on the calendar to schedule <b>{movie.title}</b>.</p>
          )}
        </div>
      </div>
    </section>
  );
}
