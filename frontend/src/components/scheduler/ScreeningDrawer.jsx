import { useEffect, useMemo, useRef, useState } from 'react';
import { getCalendar, getAnnouncementStatus } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { localDateStr, localTimeStr, splitTitleYear } from '../../utils/helpers';
import { sanitizeImageUrl } from '../../utils/sanitizeUrl';
import { Icon, Modal, TimePicker } from '../ui';
import DiscordPreview from './DiscordPreview';
import MonthGrid from './MonthGrid';
import './ScreeningDrawer.css';

const LAST_TIME_KEY = 'movienight.lastStartTime';
const FALLBACK_TIME = '20:30';
const POLL_MS = 2000;
const POLL_LIMIT = 30; // ~1 minute; the bot's 5-minute cron picks up anything slower
const QUICK_STARTS = [15, 30, 60];
const CALENDAR_MAX = 5;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => localDateStr(a) === localDateStr(b);
const combine = (day, time) => {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
};

/** Now plus `mins`, rounded up to the next `step` minutes. */
const fromNow = (mins, step = 5) => {
  const t = new Date(Date.now() + mins * 60000);
  t.setMinutes(Math.ceil(t.getMinutes() / step) * step, 0, 0);
  return t;
};

const readLastTime = () => {
  try { return localStorage.getItem(LAST_TIME_KEY) || FALLBACK_TIME; } catch { return FALLBACK_TIME; }
};
const saveLastTime = (t) => {
  try { localStorage.setItem(LAST_TIME_KEY, t); } catch { /* storage unavailable: keep the fallback */ }
};

// 24-hour everywhere in the drawer, to match the TimePicker.
const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The day as it reads in the sentence: "tonight", "tomorrow", "on Thursday", "on Thu 5 Nov". */
const dayPhrase = (day, today) => {
  const diff = Math.round((startOfDay(day) - today) / 864e5);
  if (diff === 0) return { pre: '', word: 'tonight' };
  if (diff === 1) return { pre: '', word: 'tomorrow' };
  if (diff < 7) return { pre: 'on ', word: day.toLocaleDateString(undefined, { weekday: 'long' }) };
  return { pre: 'on ', word: day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) };
};

const STATUS = {
  posting: { icon: 'clock', text: 'Posting to Discord…' },
  posted: { icon: 'check-circle', text: 'Posted in Discord.' },
  queued: { icon: 'clock', text: 'Queued. The bot will post it within 5 minutes.' },
  failed: { icon: 'info', text: 'The bot couldn’t post it. Ask an admin to check the bot.' },
  sent: { icon: 'check', text: 'Sent to the bot. It posts within a few minutes.' },
  moved: { icon: 'check-circle', text: 'Moved. The bot posts a note about the new time.' },
};

/**
 * The one place a screening gets a date: announcing a new film or moving an
 * existing night. Opened through useScheduler() (context/SchedulerContext).
 *
 * The caller owns the API: `submit(isoString)` performs the announce or
 * reschedule and resolves to `{ announcementId }` when the bot has a post to
 * make, which the drawer then polls until it is posted.
 */
export default function ScreeningDrawer({ request, onClose }) {
  const { mode = 'announce', film, submit, unschedule, currentAt, movieId, onDone } = request;
  const isReschedule = mode === 'reschedule';
  const { user } = useAuth();
  const today = startOfDay(new Date());

  const [when, setWhen] = useState(() => {
    const current = currentAt ? new Date(currentAt) : null;
    if (current && current > new Date()) return { day: startOfDay(current), time: localTimeStr(current) };
    const soon = fromNow(30, 15);
    return { day: startOfDay(soon), time: localTimeStr(soon) };
  });
  const [timeTouched, setTimeTouched] = useState(Boolean(currentAt));
  const [showMonth, setShowMonth] = useState(false);
  const [calendar, setCalendar] = useState([]);
  const [phase, setPhase] = useState('compose'); // compose | sending | sent
  const [error, setError] = useState(null);
  const [post, setPost] = useState(null);
  const [ticketNo, setTicketNo] = useState(null);
  const daysRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getCalendar()
      .then((items) => { if (alive) setCalendar(Array.isArray(items) ? items : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Nights already booked, per day. A night being moved doesn't clash with itself.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const it of calendar) {
      if (isReschedule && it.kind !== 'marathon' && it.id === movieId) continue;
      const key = localDateStr(new Date(it.scheduled_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [calendar, isReschedule, movieId]);

  // Poll until the bot has posted the announcement.
  useEffect(() => {
    if (post !== 'posting' || !ticketNo) return undefined;
    let alive = true;
    let tries = 0;
    let timer;
    const tick = async () => {
      tries += 1;
      try {
        const s = await getAnnouncementStatus(ticketNo);
        if (!alive) return;
        if (s.status === 'processed') { setPost('posted'); return; }
        if (s.status === 'failed') { setPost('failed'); return; }
      } catch {
        if (alive) setPost('sent');
        return;
      }
      if (tries >= POLL_LIMIT) { setPost('queued'); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [post, ticketNo]);

  const { day, time } = when;
  const at = combine(day, time);
  const isPast = at <= new Date();
  const isToday = sameDay(day, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const beyondWeek = !week.some((d) => sameDay(d, day));
  const clash = byDay.get(localDateStr(day)) || [];
  const upcoming = [...byDay.values()].flat()
    .filter((it) => new Date(it.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const phrase = dayPhrase(day, today);

  const pickDay = (d) => {
    setWhen((prev) => ({
      day: startOfDay(d),
      // Until the time has been set by hand, follow the day: soon for tonight,
      // otherwise the time the last screening was set for.
      time: timeTouched ? prev.time : sameDay(d, today) ? localTimeStr(fromNow(30, 15)) : readLastTime(),
    }));
    setShowMonth(false);
    setError(null);
  };

  const startIn = (mins) => {
    const t = fromNow(mins, 5);
    setWhen({ day: startOfDay(t), time: localTimeStr(t) });
    setTimeTouched(true);
    setError(null);
  };

  const focusDays = () => daysRef.current?.querySelector('.is-selected, button')?.focus();
  const focusTime = () => document.getElementById('sd-time')?.focus();

  const send = async () => {
    if (isPast) return;
    setPhase('sending');
    setError(null);
    try {
      const result = await submit(at.toISOString());
      saveLastTime(time);
      onDone?.(result);
      setPhase('sent');
      if (isReschedule) { setPost('moved'); return; }
      if (result?.announcementId) {
        setTicketNo(result.announcementId);
        setPost('posting');
      } else {
        setPost('sent');
      }
    } catch (err) {
      setPhase('compose');
      setError(err.status === 409 ? 'That film is already scheduled.' : err.message || 'Something went wrong. Try again.');
    }
  };

  const makeTbd = async () => {
    setPhase('sending');
    setError(null);
    try {
      const result = await unschedule();
      onDone?.(result);
      onClose();
    } catch (err) {
      setPhase('compose');
      setError(err.message || 'Couldn’t clear the date. Try again.');
    }
  };

  const backdrop = film.backdropUrl ? { backgroundImage: `url(${film.backdropUrl})` } : undefined;
  const status = post && STATUS[post];

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="drawer"
      label={`${isReschedule ? 'Reschedule' : 'Schedule'} ${film.title}`}
      className="sd"
    >
      <header className="sd-head">
        <span className="sd-kind">{isReschedule ? 'Reschedule' : 'Schedule a screening'}</span>
        <button type="button" className="sd-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </header>

      {phase === 'sent' ? (
        <>
          <div className="sd-scroll sd-sent">
            <article className="sd-ticket">
              <div className="sd-ticket-art" style={backdrop}>
                <div className="sd-ticket-row">
                  <span>Movie Night</span>
                  {ticketNo && <span>No. {String(ticketNo).padStart(4, '0')}</span>}
                </div>
                <h2 className="sd-ticket-film">{film.title}</h2>
              </div>
              <div className="sd-ticket-stub">
                <div>
                  <div className="sd-label">Day</div>
                  <div className="sd-ticket-val">
                    {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div>
                  <div className="sd-label">Starts</div>
                  <div className="sd-ticket-val">{fmtTime(at)}</div>
                </div>
              </div>
            </article>
            {status && (
              <p className={`sd-status is-${post}`} role="status" aria-live="polite">
                <Icon name={status.icon} size={16} />
                <span>{status.text}</span>
              </p>
            )}
          </div>
          <footer className="sd-foot">
            <div className="sd-foot-actions">
              <button type="button" className="btn lg sd-send" onClick={onClose}>Done</button>
            </div>
          </footer>
        </>
      ) : (
        <>
          <div className="sd-scroll">
            <section className="sd-sentence">
              {backdrop && <div className="sd-backdrop" style={backdrop} aria-hidden="true" />}
              <p className="sd-lead">{isReschedule ? 'Moving' : 'We’re watching'}</p>
              <h2 className="sd-film">{film.title}</h2>
              <p className="sd-when">
                {phrase.pre}
                <button type="button" className="sd-token" onClick={focusDays} aria-label={`Day: ${phrase.word}. Change`}>
                  {phrase.word}
                </button>
                {' at '}
                <button type="button" className="sd-token" onClick={focusTime} aria-label={`Time: ${fmtTime(at)}. Change`}>
                  {fmtTime(at)}
                </button>
              </p>
              {isReschedule && (
                <p className="sd-current">
                  {currentAt
                    ? <>Currently {new Date(currentAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</>
                    : 'Currently TBD'}
                </p>
              )}
            </section>

            <section className="sd-group" aria-labelledby="sd-day-label">
              <div id="sd-day-label" className="sd-label">Day</div>
              <div className="sd-days" ref={daysRef}>
                {week.map((d, i) => {
                  const selected = sameDay(d, day);
                  const booked = byDay.get(localDateStr(d)) || [];
                  const first = booked[0];
                  return (
                    <button
                      key={localDateStr(d)}
                      type="button"
                      className={`sd-day ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => pickDay(d)}
                    >
                      <span className="sd-day-name">{i === 0 ? 'Tonight' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <span className="sd-day-num">{d.getDate()}</span>
                      <span className="sd-day-booked">
                        {first
                          ? `${fmtTime(new Date(first.scheduled_at))} ${splitTitleYear(first.title).name}${booked.length > 1 ? ` +${booked.length - 1}` : ''}`
                          : ' '}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`sd-day sd-day-later ${beyondWeek ? 'is-selected' : ''} ${showMonth ? 'is-open' : ''}`}
                  aria-expanded={showMonth}
                  onClick={() => setShowMonth((v) => !v)}
                >
                  <span className="sd-day-name">{beyondWeek ? day.toLocaleDateString(undefined, { month: 'short' }) : 'Later'}</span>
                  <span className="sd-day-num">{beyondWeek ? day.getDate() : <Icon name="calendar" size={20} />}</span>
                  <span className="sd-day-booked">{beyondWeek ? ' ' : 'Pick a date'}</span>
                </button>
              </div>
              {showMonth && (
                <MonthGrid
                  value={day}
                  minDate={today}
                  busyDays={new Set(byDay.keys())}
                  onChange={pickDay}
                />
              )}
            </section>

            <section className="sd-group">
              <label htmlFor="sd-time" className="sd-label">Starts at</label>
              <div className="sd-time-row">
                <TimePicker
                  id="sd-time"
                  value={time}
                  minuteStep={5}
                  onChange={(v) => { setWhen((p) => ({ ...p, time: v })); setTimeTouched(true); setError(null); }}
                />
                {isToday && (
                  <div className="sd-quick" role="group" aria-label="Start soon">
                    {QUICK_STARTS.map((n) => (
                      <button key={n} type="button" className="sd-quick-btn" onClick={() => startIn(n)}>
                        {n < 60 ? `In ${n} min` : 'In 1 hour'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isPast && (
                <p className="sd-msg is-error" role="alert">That time has already passed. Pick a later one.</p>
              )}
              {clash.length > 0 && (
                <p className="sd-msg">
                  <Icon name="info" size={14} />
                  <span>
                    Also that night:{' '}
                    {clash.map((c) => `${splitTitleYear(c.title).name} at ${fmtTime(new Date(c.scheduled_at))}`).join(', ')}
                  </span>
                </p>
              )}
            </section>

            <section className="sd-group" aria-labelledby="sd-cal-label">
              <div id="sd-cal-label" className="sd-label">On the calendar</div>
              {upcoming.length === 0 ? (
                <p className="sd-cal-empty">Nothing else is booked. Every night is free.</p>
              ) : (
                <ul className="sd-cal">
                  {upcoming.slice(0, CALENDAR_MAX).map((it) => {
                    const d = new Date(it.scheduled_at);
                    const sameAsPicked = sameDay(d, day);
                    return (
                      <li key={`${it.kind}-${it.id}`} className={`sd-cal-row ${sameAsPicked ? 'is-same-day' : ''}`}>
                        <div className="sd-cal-date">
                          <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <span className="sd-cal-num">{d.getDate()}</span>
                          <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                        </div>
                        <div
                          className="sd-cal-poster"
                          style={sanitizeImageUrl(it.image_url) ? { backgroundImage: `url(${sanitizeImageUrl(it.image_url)})` } : undefined}
                          aria-hidden="true"
                        />
                        <div className="sd-cal-info">
                          <div className="sd-cal-title">{splitTitleYear(it.title).name}</div>
                          {it.kind === 'marathon' && it.marathon_name && (
                            <div className="sd-cal-sub">{it.marathon_name}</div>
                          )}
                        </div>
                        <div className="sd-cal-time">{fmtTime(d)}</div>
                      </li>
                    );
                  })}
                  {upcoming.length > CALENDAR_MAX && (
                    <li className="sd-cal-more">+{upcoming.length - CALENDAR_MAX} more later on</li>
                  )}
                </ul>
              )}
            </section>

            {!isReschedule && (
              <details className="sd-preview">
                <summary>
                  <Icon name="chevron-down" size={16} />
                  <span>Preview in Discord</span>
                </summary>
                <DiscordPreview film={film} when={at} announcer={user?.username} />
              </details>
            )}

            {error && <p className="sd-msg is-error" role="alert">{error}</p>}
          </div>

          <footer className="sd-foot">
            <div className="sd-foot-actions">
              <button type="button" className="btn lg sd-send" onClick={send} disabled={phase === 'sending' || isPast}>
                {phase === 'sending'
                  ? (isReschedule ? 'Moving…' : 'Announcing…')
                  : isReschedule
                    ? <><Icon name="calendar" size={16} /> Move to {phrase.word} at {fmtTime(at)}</>
                    : <><Icon name="megaphone" size={16} /> Announce in Discord</>}
              </button>
              {isReschedule && unschedule && currentAt && (
                <button type="button" className="btn ghost lg" onClick={makeTbd} disabled={phase === 'sending'}>
                  Make TBD
                </button>
              )}
            </div>
            <p className="sd-foot-note">
              {isReschedule ? 'The bot posts a note about the new time.' : 'The bot posts it to the movie-night channel.'}
            </p>
          </footer>
        </>
      )}
    </Modal>
  );
}
