import { useState } from 'react';
import { localDateStr } from '../../utils/helpers';
import { Icon } from '../ui';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Compact month calendar for dates beyond the week of day chips. Monday-first.
 * Days before `minDate` are disabled; days in `busyDays` (a Set of
 * YYYY-MM-DD strings) carry a dot.
 */
export default function MonthGrid({ value, onChange, minDate, busyDays }) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const min = startOfDay(minDate);
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const canGoBack = new Date(view.getFullYear(), view.getMonth(), 0) >= min;

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' })
  );

  const shift = (n) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <div className="mg">
      <div className="mg-head">
        <button type="button" className="mg-nav" onClick={() => shift(-1)} disabled={!canGoBack} aria-label="Previous month">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className="mg-month" aria-live="polite">
          {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button type="button" className="mg-nav" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="mg-grid" role="grid">
        {weekdays.map((w, i) => <div key={`w${i}`} className="mg-wd" aria-hidden="true">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = new Date(view.getFullYear(), view.getMonth(), i + 1);
          const key = localDateStr(day);
          const selected = key === localDateStr(value);
          const busy = busyDays.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`mg-day ${selected ? 'is-selected' : ''} ${busy ? 'is-busy' : ''}`}
              disabled={day < min}
              aria-pressed={selected}
              aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${busy ? ', already has a screening' : ''}`}
              onClick={() => onChange(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
