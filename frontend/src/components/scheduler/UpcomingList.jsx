import { useEffect, useRef } from 'react';
import { localDateStr, splitTitleYear } from '../../utils/helpers';
import { sanitizeImageUrl } from '../../utils/sanitizeUrl';

const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const sameDay = (a, b) => Boolean(a && b) && localDateStr(a) === localDateStr(b);

function Row({ at, title, sub, posterUrl, className = '', rowRef }) {
  return (
    <li ref={rowRef} className={`sd-cal-row ${className}`.trim()}>
      <div className="sd-cal-date">
        <span>{at.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span className="sd-cal-num">{at.getDate()}</span>
        <span>{at.toLocaleDateString(undefined, { month: 'short' })}</span>
      </div>
      <div
        className="sd-cal-poster"
        style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}
        aria-hidden="true"
      />
      <div className="sd-cal-info">
        <div className="sd-cal-title">{title}</div>
        {sub && <div className="sd-cal-sub">{sub}</div>}
      </div>
      <div className="sd-cal-time">{fmtTime(at)}</div>
    </li>
  );
}

/**
 * The nights already booked, soonest first, as the composer shows them. Rows
 * on the day being picked are marked. `pending` ({ film, at, note }) slots the
 * screening being scheduled in at its date, so you can see where it lands.
 */
export default function UpcomingList({ items, day, pending, max = 5 }) {
  const pendingRef = useRef(null);
  const pendingMs = pending?.at?.getTime();

  // Laid out as a sideways strip (over the frontpage hero), keep the pending
  // night in view as its date moves. Scrolls the strip only, never the page.
  useEffect(() => {
    const row = pendingRef.current;
    const strip = row?.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const left = row.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + row.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 16), behavior: 'smooth' });
    }
  }, [pendingMs]);

  const now = new Date();
  const upcoming = items
    .filter((it) => new Date(it.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Once announced, the night can come back from the calendar too; don't list it twice.
  const pendingAt = pending?.at;
  const showPending = pendingAt && !upcoming.some(
    (it) => new Date(it.scheduled_at).getTime() === pendingAt.getTime()
      && splitTitleYear(it.title).name === pending.film.title,
  );

  const shown = upcoming.slice(0, max);
  const insertAt = showPending
    ? shown.filter((it) => new Date(it.scheduled_at) <= pendingAt).length
    : -1;

  const rows = shown.map((it) => {
    const at = new Date(it.scheduled_at);
    return (
      <Row
        key={`${it.kind}-${it.id}`}
        at={at}
        title={splitTitleYear(it.title).name}
        sub={it.kind === 'marathon' ? it.marathon_name : null}
        posterUrl={sanitizeImageUrl(it.image_url)}
        className={sameDay(at, day) ? 'is-same-day' : ''}
      />
    );
  });
  if (showPending) {
    rows.splice(insertAt, 0, (
      <Row
        key="pending"
        at={pendingAt}
        title={pending.film.title}
        sub={pending.note}
        posterUrl={pending.film.posterUrl}
        className="is-pending"
        rowRef={pendingRef}
      />
    ));
  }

  if (rows.length === 0) {
    return <p className="sd-cal-empty">Nothing else is booked. Every night is free.</p>;
  }

  return (
    <>
      <ul className="sd-cal">
        {rows}
        {upcoming.length > max && (
          <li className="sd-cal-more">+{upcoming.length - max} more later on</li>
        )}
      </ul>
      {upcoming.length === 0 && <p className="sd-cal-empty sd-cal-after">Nothing else is booked. Every night is free.</p>}
    </>
  );
}
