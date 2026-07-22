import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import MarathonWizard from '../components/marathons/MarathonWizard';
import MarathonDetail from '../components/marathons/MarathonDetail';
import './MarathonsPage.css';

const STATUS_LABEL = { active: 'Active', paused: 'Paused', draft: 'Draft', completed: 'Done' };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';

function MarathonCard({ m }) {
  const posters = (m.poster_urls || []).filter(Boolean).slice(0, 4);
  const total = m.item_count || 0;
  const watched = m.watched_count || 0;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  return (
    <Link to={`/marathons/${m.id}`} className="mara-card">
      <div className="mara-posters">
        {posters.length === 0 && <div className="mara-poster empty" />}
        {posters.map((url, i) => (
          <div key={i} className="mara-poster" style={{ backgroundImage: url ? `url(${url})` : 'none' }} />
        ))}
      </div>
      <div className="mara-body">
        <h3>{m.name}</h3>
        <div className="mara-meta">
          <span className={`mara-chip ${m.status}`}>{STATUS_LABEL[m.status] || m.status}</span>
          {m.cadence_type && <span className="mara-cadence">{m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly'}</span>}
        </div>
        <div className="mara-progress">
          <div className="mara-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="mara-progress-meta">
            <span>{m.next_item ? `Next: ${m.next_item.title} · ${fmtDate(m.next_item.scheduled_at)}` : (total ? 'All watched' : 'No films yet')}</span>
            <span>{watched} / {total}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MarathonsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showError } = useNotification();
  const [marathons, setMarathons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

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
          <p>Build an ordered set of films and let it schedule itself, one a week.</p>
        </div>
        {isAuthenticated && (
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Icon name="plus" size={16} /> New marathon
          </button>
        )}
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : marathons.length === 0 ? (
        <div className="empty">
          <h3>No marathons yet.</h3>
          <p>Create one to schedule a series of movies.</p>
        </div>
      ) : (
        <div className="mara-list">
          {marathons.map((m) => <MarathonCard key={m.id} m={m} />)}
        </div>
      )}

      {wizardOpen && (
        <MarathonWizard
          onClose={() => setWizardOpen(false)}
          onLaunched={(newId) => { setWizardOpen(false); navigate(`/marathons/${newId}`); }}
          onSavedDraft={() => { setWizardOpen(false); load(); }}
        />
      )}
    </div>
  );
}
