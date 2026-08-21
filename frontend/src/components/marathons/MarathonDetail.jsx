import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import * as api from '../../api/client';
import { Icon } from '../ui';
import MarkWatchedPanel from './MarkWatchedPanel';

const fmtWhen = (d) =>
  d ? new Date(d).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unscheduled';
const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (v) => {
  const date = new Date(v);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const itemState = (it) => {
  // A film logged by hand is watched outright — its date may be minutes old, so
  // the date comparison alone would still call it upcoming right after logging.
  if (it.status === 'watched') return 'watched';
  if (!it.scheduled_at) return 'wait';
  return new Date(it.scheduled_at) < new Date() ? 'watched' : 'upcoming';
};

const runtimeStr = (mins) => {
  if (!mins) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? `${h}h ` : ''}${m}m`;
};

export default function MarathonDetail({ id, onBack }) {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState(null);   // item id being date-edited
  const [confirmRemove, setConfirmRemove] = useState(null); // item id awaiting remove confirmation
  // Which row has the "Already watched" panel open: an item id, or 'hero' for the
  // next-up card. A string can never collide with an id, so one piece of state
  // covers both entry points without ever rendering the panel twice.
  const [markWatched, setMarkWatched] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const confirmRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM(await api.getMarathon(id)); }
    catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [id, showError]);

  useEffect(() => { load(); }, [load]);

  // While a row is asking "Remove?", a click anywhere else — or Escape — backs out.
  useEffect(() => {
    if (confirmRemove === null) return undefined;
    const onDown = (e) => { if (!confirmRef.current?.contains(e.target)) setConfirmRemove(null); };
    const onKey = (e) => { if (e.key === 'Escape') setConfirmRemove(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmRemove]);

  const doAction = async (fn, msg, after) => {
    try { await fn(); showSuccess(msg); if (after) after(); else load(); }
    catch (err) { showError(err.message); }
  };

  const changeDate = async (item, value) => {
    setEditingDate(null);
    try {
      // Empty value clears the date → the film becomes "TBD" (won't roll out
      // until dated again). A value sets/updates the date as before.
      await api.updateMarathonItemDate(m.id, item.id, value ? new Date(value).toISOString() : null);
      showSuccess(value ? 'Date updated' : 'Film set to TBD'); load();
    } catch (err) { showError(err.message); }
  };

  const makeItemTbd = (item) => changeDate(item, '');

  const removeItem = async (item) => {
    setConfirmRemove(null);
    try {
      await api.removeMarathonItem(m.id, item.id);
      showSuccess(`“${item.title}” removed`);
      load();
    } catch (err) { showError(err.message); }
  };

  const undoWatched = async (item) => {
    try {
      await api.unmarkMarathonItemWatched(m.id, item.id);
      showSuccess(`“${item.title}” is back in the queue — give it a date when you know it`);
      load();
    } catch (err) { showError(err.message); }
  };

  // Keyed on the stored status, not itemState: itemState calls anything with a past
  // date 'watched', which would hide this action on a pending film whose date has
  // simply slipped — the out-of-sync marathon this feature exists to repair. A film
  // the bot has taken is still excluded ('scheduled' covers queued and posted alike,
  // since the link isn't written until the processor posts).
  const canMarkWatched = (it) =>
    m?.is_owner && it.status !== 'watched' && it.status !== 'scheduled' && !it.scheduled_movie_night_id;

  const onDrop = async (items, idx) => {
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); setDragOver(null); return; }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setDragIndex(null); setDragOver(null);
    setM((prev) => ({ ...prev, items: next }));
    try { await api.reorderMarathonItems(m.id, next.map((i) => i.id)); load(); }
    catch (err) { showError(err.message); load(); }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!m) return <p className="muted">Marathon not found.</p>;

  const items = m.items || [];
  const total = items.length;
  const watched = items.filter((it) => itemState(it) === 'watched').length;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const nextItem = items.find((it) => itemState(it) !== 'watched');
  const totalRuntime = runtimeStr(items.reduce((s, it) => s + (it.runtime || 0), 0));
  const cadenceText = m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly';
  const schedHint = items[0]?.scheduled_at
    ? ` · ${new Date(items[0].scheduled_at).toLocaleDateString(undefined, { weekday: 'long' })}s ${fmtTime(items[0].scheduled_at)}`
    : '';

  return (
    <div className="mara-detail">
      <button className="mara-back" onClick={onBack}><Icon name="arrow-left" size={15} /> All marathons</button>

      <div className="mara-top">
        <div>
          <div className="mara-eyebrow2"><Icon name="layers" size={13} /> Marathon · {cadenceText}{schedHint}</div>
          <h1>{m.name}</h1>
          <div className="mara-submeta">
            <span className={`mara-chip ${m.status}`}>{m.status}</span>
            {m.created_by_name && <><span className="mara-dot" /><span>Started by {m.created_by_name}</span></>}
            <span className="mara-dot" /><span>{total} film{total === 1 ? '' : 's'}{totalRuntime ? ` · ${totalRuntime}` : ''}</span>
          </div>
        </div>
        {m.is_owner && (
          <div className="mara-actions">
            <button className="btn ghost" onClick={() => navigate(`/marathons/${m.id}/add`)}><Icon name="plus" size={15} /> Add films</button>
            {m.status === 'active' && <button className="btn" onClick={() => doAction(() => api.pauseMarathon(m.id), 'Paused')}><Icon name="pause" size={15} /> Pause</button>}
            {m.status === 'paused' && <button className="btn" onClick={() => doAction(() => api.resumeMarathon(m.id), 'Resumed')}><Icon name="play" size={15} /> Resume</button>}
            <button className="btn danger" title="Delete marathon" onClick={() => {
              if (window.confirm('Delete this marathon? This cannot be undone.')) {
                doAction(() => api.deleteMarathon(m.id), 'Deleted', onBack);
              }
            }}><Icon name="trash" size={15} /></button>
          </div>
        )}
      </div>

      <div className="mara-band">
        <span className="txt"><b>{watched}</b> of {total} watched</span>
        <div className="pbar"><i style={{ width: `${pct}%` }} /></div>
        <span className="txt">{total - watched} to go</span>
      </div>

      {/* Next-up hero */}
      {nextItem && (
        <div className="mara-nextcard">
          <div className="poster" style={{ backgroundImage: nextItem.image_url ? `url(${nextItem.image_url})` : 'none' }} />
          <div className="nb">
            <div className="k">Up next</div>
            <h3>{nextItem.title}{nextItem.release_year ? <span className="yr"> ({nextItem.release_year})</span> : null}</h3>
            <div className="when"><Icon name="calendar-clock" size={15} /> {fmtWhen(nextItem.scheduled_at)}</div>
            <div className="post"><Icon name="send" size={13} /> Posts to Discord automatically as the date approaches</div>
            <div className="row">
              {editingDate === nextItem.id ? (
                <input className="li-date" type="datetime-local" autoFocus
                  min={toLocalInput(new Date())}
                  defaultValue={nextItem.scheduled_at ? toLocalInput(nextItem.scheduled_at) : ''}
                  onBlur={(e) => changeDate(nextItem, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') changeDate(nextItem, e.target.value); }} />
              ) : (
                m.is_owner && (
                  <>
                    <button className="btn" onClick={() => setEditingDate(nextItem.id)}><Icon name="calendar" size={15} /> {nextItem.scheduled_at ? 'Change date' : 'Set date'}</button>
                    {nextItem.scheduled_at && <button className="btn ghost" onClick={() => makeItemTbd(nextItem)}>Make TBD</button>}
                    {canMarkWatched(nextItem) && (
                      <button className="btn ghost" onClick={() => setMarkWatched(markWatched === 'hero' ? null : 'hero')}>
                        <Icon name="check-circle" size={15} /> Already watched
                      </button>
                    )}
                  </>
                )
              )}
              <button className="btn" disabled title="Available once the film posts to Discord"><Icon name="check" size={15} /> I&rsquo;m attending</button>
              <button className="btn" disabled title="Manual posting coming in a later update"><Icon name="send" size={15} /> Post now</button>
            </div>
            {markWatched === 'hero' && (
              <MarkWatchedPanel marathonId={m.id} item={nextItem}
                onDone={() => { setMarkWatched(null); showSuccess(`“${nextItem.title}” logged as watched`); load(); }}
                onCancel={() => setMarkWatched(null)}
                onError={showError} />
            )}
          </div>
        </div>
      )}

      {/* Lineup */}
      <div className="mara-sectitle">The lineup</div>
      {items.map((it, idx) => {
        const st = itemState(it);
        const isNext = it.id === nextItem?.id;
        // Past its date but never announced — a lapsed film, not a watched one.
        // Only 'pending' qualifies: a 'scheduled' film really did air, and a
        // 'watched' one was logged by hand.
        const missed = st === 'watched' && it.status === 'pending';
        const stateCls = missed ? 'wait' : st === 'watched' ? 'done' : isNext ? 'next' : 'wait';
        const stateIcon = missed ? 'clock' : st === 'watched' ? 'check-circle' : isNext ? 'play-circle' : 'clock';
        // Queued films only: watched ones are history and next-up may already be
        // posted to Discord. Gates the drag handle and the remove button alike.
        const editable = m.is_owner && st !== 'watched' && !isNext;
        const confirming = confirmRemove === it.id;
        const prev = items[idx - 1];
        return (
          <div key={it.id}>
            <div
              className={`mara-li2 ${st === 'watched' && !missed ? 'past' : ''} ${dragIndex === idx ? 'dragging' : ''} ${dragOver === idx ? 'dragover' : ''} ${confirming ? 'confirming' : ''}`}
              draggable={editable && !confirming}
              onDragStart={() => editable && !confirming && setDragIndex(idx)}
              onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDragOver(idx); } }}
              onDragLeave={() => setDragOver((o) => (o === idx ? null : o))}
              onDrop={() => onDrop(items, idx)}
              onDragEnd={() => { setDragIndex(null); setDragOver(null); }}>
            <span className="num">{idx + 1}</span>
            <span className={`state ${stateCls}`}><Icon name={stateIcon} size={18} /></span>
            <div className="poster" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
            <div className="t">
              <h4>{it.title}</h4>
              <div className="m">
                {missed ? `Was due ${fmtDay(it.scheduled_at)}`
                  : st === 'watched' ? `Watched ${fmtDay(it.scheduled_at)}`
                  : isNext ? <span className="mara-badge-next">Next up</span>
                  : prev ? `Queues after ${prev.title}` : 'Queued'}
              </div>
            </div>
            <div className="date"><b>{fmtDay(it.scheduled_at)}</b>{fmtTime(it.scheduled_at) || 'unscheduled'}</div>
            {it.status === 'watched' ? (
              // Routed on the stored status, not itemState: undo only has something
              // to undo on a hand-logged film. A film the bot announced and aired
              // also reads as watched by date, and offering undo there would report
              // success while changing nothing.
              m.is_owner && (
                <button className="mara-iconbtn" title={`Put “${it.title}” back in the queue`}
                  onClick={() => undoWatched(it)}><Icon name="undo" size={15} /></button>
              )
            ) : (
              <>
                {!isNext && canMarkWatched(it) && (
                  <button className="mara-iconbtn" title={`Mark “${it.title}” as already watched`}
                    onClick={() => setMarkWatched(markWatched === it.id ? null : it.id)}>
                    <Icon name="check-circle" size={15} /></button>
                )}
                {editable && (confirming ? (
                  <span className="li-confirm" ref={confirmRef}>
                    <button className="btn destructive sm" onClick={() => removeItem(it)}>Remove</button>
                    <button className="btn ghost sm" onClick={() => setConfirmRemove(null)}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <span className="grip"><Icon name="grip" size={15} /></span>
                    <button className="mara-iconbtn danger" title={`Remove ${it.title}`}
                      onClick={() => setConfirmRemove(it.id)}><Icon name="close" size={15} /></button>
                  </>
                ))}
              </>
            )}
            </div>
            {markWatched === it.id && (
              <MarkWatchedPanel marathonId={m.id} item={it}
                onDone={() => { setMarkWatched(null); showSuccess(`“${it.title}” logged as watched`); load(); }}
                onCancel={() => setMarkWatched(null)}
                onError={showError} />
            )}
          </div>
        );
      })}

      <div className="mara-foot">
        <Icon name="info" size={16} />
        <div>{nextItem
          ? <><b>Only “{nextItem.title}” is queued next.</b> Everything below it is editable — drag to reorder or change a date — until it becomes next-up. Pause anytime and the roll-out stops.</>
          : <>All films have been scheduled. This marathon is complete.</>}</div>
      </div>
    </div>
  );
}
