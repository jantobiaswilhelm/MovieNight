import { useState } from 'react';
import { Icon } from '../ui';
import './InlineScheduler.css';

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function InlineScheduler({ occupancy = [], value, onChange, renderCompose }) {
  const today = startOfDay(new Date());
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Map day → events for quick lookup.
  const byDay = {};
  for (const ev of occupancy) {
    const d = new Date(ev.scheduled_at);
    const k = dayKey(d);
    (byDay[k] = byDay[k] || []).push(ev);
  }

  const year = view.getFullYear(), month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const step = (delta) => setView(new Date(year, month + delta, 1));

  return (
    <div className="isch">
      <div className="isch-head">
        <div className="isch-title">{monthLabel}
          <span className="isch-nav">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month"><Icon name="chevron-left" size={16} /></button>
            <button type="button" onClick={() => step(1)} aria-label="Next month"><Icon name="chevron-right" size={16} /></button>
          </span>
        </div>
        <div className="isch-legend">
          <span className="mara"><i /> Marathon</span>
          <span className="oneoff"><i /> One-off</span>
          <span className="free"><i /> Open</span>
        </div>
      </div>

      <div className="isch-dow">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="isch-grid">
        {cells.map((cell, i) => {
          if (!cell) return <div className="isch-cell empty" key={`e${i}`} />;
          const past = cell < today;
          const evs = byDay[dayKey(cell)] || [];
          const selected = value && dayKey(startOfDay(value)) === dayKey(cell);
          const isToday = dayKey(cell) === dayKey(today);
          return (
            <button type="button" key={dayKey(cell)}
              className={`isch-cell ${past ? 'past' : ''} ${selected ? 'sel' : ''} ${isToday ? 'today' : ''}`}
              disabled={past}
              onClick={() => !past && onChange && onChange(cell)}>
              <span className="dn">{cell.getDate()}</span>
              {evs.slice(0, 2).map((ev) => (
                <span key={ev.id} className={`isch-evt ${ev.kind === 'marathon' ? 'mara' : 'oneoff'}`}>
                  <Icon name={ev.kind === 'marathon' ? 'layers' : 'film'} size={9} /> {ev.title}
                </span>
              ))}
              {evs.length === 0 && !past && <span className="isch-free">+ schedule</span>}
            </button>
          );
        })}
      </div>

      {value && renderCompose && (
        <div className="isch-compose">{renderCompose(value)}</div>
      )}
    </div>
  );
}
