import { useEffect, useState } from 'react';
import { PageHeader, Skeleton, EmptyState } from '../components/ui';
import './DevlogPage.css';

const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * What changed on the site, newest first.
 *
 * Entries live in frontend/public/devlog.json, served at /devlog.json so the
 * bot can read them too. Add new ones at the top:
 *
 *   { "id": "YYYY-MM-DD-short-slug", "date": "YYYY-MM-DD", "title": "…",
 *     "discord": false, "summary": "One line.", "items": ["…"] }
 *
 * Set "discord": true on bigger changes and the bot posts that entry to the
 * movie-night channel once, after the deploy (bot/src/jobs/devlogPoster.js).
 * The id must stay the same after posting, or it counts as a new entry.
 */
export default function DevlogPage() {
  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/devlog.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (alive) setEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Several entries can share a date; the date prints once per day.
  const days = [];
  for (const entry of entries || []) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }

  return (
    <div className="devlog">
      <PageHeader
        eyebrow="From the projection booth"
        title="Devlog"
        meta={entries ? [`${entries.length} entries`, 'Newest first'] : undefined}
      />

      {failed ? (
        <EmptyState title="The devlog didn’t load." body="Try again in a moment." />
      ) : !entries ? (
        <div className="devlog-loading">
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={96} />)}
        </div>
      ) : (
        <ol className="devlog-days">
          {days.map((day) => (
            <li key={day.date} className="devlog-day">
              <time className="devlog-date" dateTime={day.date}>{fmtDate(day.date)}</time>
              <div className="devlog-entries">
                {day.entries.map((entry) => (
                  <article key={entry.id || entry.title} className="devlog-entry">
                    <h2 className="devlog-title">{entry.title}</h2>
                    {entry.summary && <p className="devlog-summary">{entry.summary}</p>}
                    {entry.items?.length > 0 && (
                      <ul className="devlog-items">
                        {entry.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
