import { Link } from 'react-router-dom';
import { Icon } from '../ui';
import { splitTitleYear } from '../../utils/helpers';
import './OnTheCalendar.css';

const dayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
};
const isToday = (d) => dayKey(d) === dayKey(new Date());
const fmtDow = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
const fmtNum = (d) => new Date(d).getDate();
const fmtMon = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short' });
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function OnTheCalendar({ items = [], fallback = null }) {
  if (!items.length) return fallback;

  // Group by calendar day, preserving date order.
  const days = [];
  const byKey = {};
  for (const it of items) {
    const k = dayKey(it.scheduled_at);
    if (!byKey[k]) { byKey[k] = { key: k, date: it.scheduled_at, events: [] }; days.push(byKey[k]); }
    byKey[k].events.push(it);
  }

  return (
    <div className="otc">
      {days.map((day) => (
        <div className="otc-day" key={day.key}>
          <div className={`otc-daycol ${isToday(day.date) ? 'today' : ''}`}>
            <div className="dow">{fmtDow(day.date)}</div>
            <div className="dnum">{fmtNum(day.date)}</div>
            <div className="mon">{fmtMon(day.date)}</div>
          </div>
          <div className="otc-slots">
            {day.events.map((ev) => {
              const past = new Date(ev.scheduled_at) <= new Date();
              const score = parseFloat(ev.avg_rating);
              // One-off ids are movie night ids; marathon items ("mi-7") have no page.
              const href = ev.kind === 'marathon' ? null : `/movie/${ev.id}`;
              const name = splitTitleYear(ev.title).name;
              return (
              <div className="otc-ev" key={ev.id}>
                <div className="otc-poster" style={{ backgroundImage: ev.image_url ? `url(${ev.image_url})` : 'none' }} />
                <div className="otc-info">
                  <h3>{href ? <Link to={href}>{name}</Link> : name}</h3>
                  {ev.kind === 'marathon' && (
                    <div className="otc-meta">
                      <span className="otc-tag mara">
                        <Icon name={ev.cadence_type === 'binge' ? 'film' : 'layers'} size={11} />
                        {ev.cadence_type === 'binge' ? 'Marathon' : `Marathon ${ev.marathon_position}/${ev.marathon_total}`}
                      </span>
                      <span className="otc-sub">{ev.marathon_name || ''}</span>
                    </div>
                  )}
                </div>
                {/* A past night shows what the club thought of it; a clock time
                    there reads like a runtime. */}
                {past
                  ? score > 0 && <div className="otc-score" title="Club average">{score.toFixed(1)}</div>
                  : <div className="otc-time">{fmtTime(ev.scheduled_at)}</div>}
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
