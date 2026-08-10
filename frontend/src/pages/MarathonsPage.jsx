import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import MarathonDetail from '../components/marathons/MarathonDetail';
import './MarathonsPage.css';

const STATUS = {
  active:    { label: 'Active',  sym: '●' },
  paused:    { label: 'Paused',  sym: '❚❚' },
  draft:     { label: 'Draft',   sym: '○' },
  completed: { label: 'Done',    sym: '✓' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';

// The three "Start from a set" ideas (sources land in later plans; these route
// into the create wizard where their build methods live).
const IDEAS = [
  { key: 'franchise', icon: 'layers', k: 'Franchise', h: 'From a collection', p: 'Trilogies & sagas, in order' },
  { key: 'person',    icon: 'user',   k: 'By director', h: 'A filmography', p: 'Pull their films from TMDB' },
  { key: 'vibe',      icon: 'sparkles', k: 'Curated',  h: 'Describe a vibe', p: 'A mood → a lineup to review' },
];

function MarathonCard({ m, onChanged, showError }) {
  const navigate = useNavigate();
  const posters = (m.poster_urls || []).filter(Boolean);
  const shown = posters.slice(0, 3);
  const extra = (m.item_count || 0) - shown.length;
  const total = m.item_count || 0;
  const watched = m.watched_count || 0;
  const airing = m.airing_item || null;
  // A film on screen counts as neither watched nor pending — show it as the
  // partial segment so the bar doesn't stall while it plays.
  const pct = total ? Math.round(((watched + (airing ? 0.5 : 0)) / total) * 100) : 0;
  const st = STATUS[m.status] || { label: m.status, sym: '' };

  const act = async (e, fn, msg) => {
    e.stopPropagation();
    try { await fn(); onChanged(); } catch (err) { showError(err.message || msg); }
  };

  return (
    <div className="mara-card" role="link" tabIndex={0}
      onClick={() => navigate(`/marathons/${m.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/marathons/${m.id}`); }}>
      <div className="mara-posters">
        {shown.length === 0 && <div className="mara-poster" />}
        {shown.map((url, i) => (
          <div key={i} className="mara-poster" style={{ backgroundImage: url ? `url(${url})` : 'none' }} />
        ))}
        {extra > 0 && <div className="mara-poster more">+{extra}</div>}
      </div>

      <div className="mara-cardinfo">
        <h3>{m.name}</h3>
        <div className="mara-cardmeta">
          <span className={`mara-chip ${m.status}`}>{st.sym} {st.label}</span>
          {airing && <><span className="mara-dot" />
            <span className="mara-chip airing"><span className="mara-livedot" />Airing now</span></>}
          {m.cadence_type && <><span className="mara-dot" />
            <span className="mara-cadence"><Icon name={m.cadence_type === 'binge' ? 'film' : 'calendar-clock'} size={14} />
              {m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly'}</span></>}
        </div>
        <div className="mara-progress">
          <div className={`mara-bar ${m.status === 'paused' ? 'paused' : ''}`}><i style={{ width: `${pct}%` }} /></div>
          <div className="mara-progress-meta">
            <span className="next">
              {airing ? <>Now playing: <b>{airing.title}</b></>
                : (m.next_item ? <>Next: <b>{m.next_item.title}</b>{m.next_item.scheduled_at ? ` · ${fmtDate(m.next_item.scheduled_at)}` : ''}</>
                : (total ? 'All watched' : 'No films yet'))}
            </span>
            <span className="count">{watched} / {total}{total ? ' watched' : ''}</span>
          </div>
        </div>
      </div>

      <div className="mara-cardactions">
        {m.is_owner && m.status === 'active' && (
          <button className="mara-iconbtn" title="Pause" onClick={(e) => act(e, () => api.pauseMarathon(m.id), 'Failed to pause')}>
            <Icon name="pause" size={16} />
          </button>
        )}
        {m.is_owner && m.status === 'paused' && (
          <button className="mara-iconbtn" title="Resume" onClick={(e) => act(e, () => api.resumeMarathon(m.id), 'Failed to resume')}>
            <Icon name="play" size={16} />
          </button>
        )}
        <button className="mara-iconbtn" title="Open" onClick={(e) => { e.stopPropagation(); navigate(`/marathons/${m.id}`); }}>
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
    </div>
  );
}

export default function MarathonsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showError } = useToast();
  const [marathons, setMarathons] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMarathons(await api.getMarathons());
    } catch (err) {
      showError(err.message || 'Failed to load marathons');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { if (!id) load(); }, [id, load]);

  if (id) {
    return <MarathonDetail id={id} onBack={() => navigate('/marathons')} />;
  }

  return (
    <div className="mara-page">
      <header className="mara-header">
        <div>
          <div className="mara-eyebrow">Series &amp; Marathons</div>
          <h1>Movie Marathons</h1>
          <p>Build an ordered set of films and let it schedule itself — one a week, rolled out to Discord one film at a time.</p>
        </div>
        {isAuthenticated && (
          <button className="btn btn-primary" onClick={() => navigate('/marathons/new')}>
            <Icon name="plus" size={16} /> New marathon
          </button>
        )}
      </header>

      <div className="mara-sechead"><h2>Your marathons</h2></div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : marathons.length === 0 ? (
        <div className="mara-empty">
          <h3>No marathons yet.</h3>
          <p>Create one to schedule a series of movies.</p>
        </div>
      ) : (
        <div className="mara-list">
          {marathons.map((m) => <MarathonCard key={m.id} m={m} onChanged={load} showError={showError} />)}
        </div>
      )}

      {isAuthenticated && (
        <>
          <div className="mara-sechead"><h2>Start from a set</h2></div>
          <div className="mara-srow">
            {IDEAS.map((idea) => (
              <Link key={idea.key} to={`/marathons/new?source=${idea.key}`} className="mara-scard">
                <div className="strip">
                  <div className="t"><Icon name={idea.icon} size={20} /></div>
                  <div className="t"><Icon name="film" size={20} /></div>
                  <div className="t"><Icon name="calendar-clock" size={20} /></div>
                </div>
                <div className="sbody"><div className="k">{idea.k}</div><h4>{idea.h}</h4><p>{idea.p}</p></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
