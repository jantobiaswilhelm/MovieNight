import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import * as api from '../../api/client';
import { Icon } from '../ui';

const fmt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unscheduled';

const itemState = (it) => {
  if (!it.scheduled_at) return 'pending';
  return new Date(it.scheduled_at) < new Date() ? 'watched' : 'upcoming';
};

export default function MarathonDetail({ id, onBack }) {
  const { showError, showSuccess } = useToast();
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM(await api.getMarathon(id)); }
    catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [id, showError]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn, msg) => {
    try { await fn(); showSuccess(msg); load(); }
    catch (err) { showError(err.message); }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!m) return <p className="muted">Marathon not found.</p>;

  const items = m.items || [];
  const total = items.length;
  const watched = items.filter((it) => itemState(it) === 'watched').length;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const nextItem = items.find((it) => itemState(it) !== 'watched');

  return (
    <div className="mara-page">
      <button className="btn text" onClick={onBack}><Icon name="chevron-left" size={16} /> All marathons</button>

      <header className="mara-header">
        <div>
          <div className="mara-eyebrow">Marathon · {m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly'}</div>
          <h1>{m.name}</h1>
          <div className="mara-meta">
            <span className={`mara-chip ${m.status}`}>{m.status}</span>
            <span className="mara-cadence">{m.created_by_name ? `by ${m.created_by_name}` : ''} · {total} films</span>
          </div>
        </div>
        {m.is_owner && (
          <div className="mara-row">
            {m.status === 'active' && <button className="btn ghost" onClick={() => doAction(() => api.pauseMarathon(m.id), 'Paused')}><Icon name="pause" size={16} /> Pause</button>}
            {m.status === 'paused' && <button className="btn ghost" onClick={() => doAction(() => api.resumeMarathon(m.id), 'Resumed')}><Icon name="play" size={16} /> Resume</button>}
            <button className="btn ghost danger" onClick={() => doAction(() => api.deleteMarathon(m.id), 'Deleted')}><Icon name="trash" size={16} /></button>
          </div>
        )}
      </header>

      <div className="mara-field">
        <div className="mara-bar" style={{ maxWidth: 'none' }}><i style={{ width: `${pct}%` }} /></div>
        <div className="mara-progress-meta" style={{ maxWidth: 'none' }}>
          <span>{watched} of {total} watched</span>
          <span>{nextItem ? `Next: ${nextItem.title} · ${fmt(nextItem.scheduled_at)}` : 'Complete'}</span>
        </div>
      </div>

      <div className="mara-field">
        <label className="mara-label">The lineup</label>
        {items.map((it, idx) => {
          const st = itemState(it);
          return (
            <div key={it.id} className="mara-item">
              <span className="pos">{idx + 1}</span>
              <div className="thumb" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
              <div className="grow">
                <h4>{it.title}</h4>
                <div className="sub">
                  {st === 'watched' ? 'Watched' : st === 'upcoming' ? (it.id === nextItem?.id ? 'Next up' : 'Upcoming') : 'Not scheduled'}
                  {' · '}{fmt(it.scheduled_at)}
                </div>
              </div>
              {st === 'watched' && <Icon name="check" size={16} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
