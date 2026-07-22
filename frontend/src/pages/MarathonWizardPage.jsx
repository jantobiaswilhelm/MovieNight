import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import './MarathonsPage.css';

// Map GET /api/tmdb/:id detail shape → the tmdb_data our item endpoint expects.
const toItemData = (d) => ({
  tmdbId: d.id, title: d.title, imageUrl: d.posterPath, backdropUrl: d.backdropPath,
  description: d.overview, tmdbRating: d.rating, genres: d.genres, runtime: d.runtime,
  releaseYear: d.year, tagline: d.tagline, imdbId: d.imdbId,
  originalLanguage: d.originalLanguage, trailerUrl: d.trailerUrl
});

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fmtShort = (v) =>
  v ? new Date(v).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// The four build methods. Only "manual" ships in the Core MVP; the rest are
// visible (so the flow matches the design) but disabled until later plans.
const SOURCES = [
  { key: 'manual',    icon: 'search',   title: 'Pick movies yourself',  desc: 'Search TMDB and add films one by one. Full control over order.', tag: 'Manual', enabled: true },
  { key: 'person',    icon: 'user',     title: 'By actor or director',  desc: 'Search a person → pull their films straight from TMDB. Zero guesswork.', tag: 'Soon', enabled: false },
  { key: 'franchise', icon: 'layers',   title: 'From a franchise',      desc: 'Grab a whole collection in order — trilogies, sagas — from your library.', tag: 'Soon', enabled: false },
  { key: 'vibe',      icon: 'sparkles', title: 'Describe a vibe',       desc: 'Tell the AI a mood or theme and get a lineup you review before it schedules.', tag: 'Soon', enabled: false },
];

const STEPS = ['Source', 'Lineup', 'Schedule', 'Review'];

function Stepper({ phase }) {
  // phase: 'source' | 'build' | 'review'. Build lights up both Lineup + Schedule.
  const stateFor = (i) => {
    if (phase === 'source') return i === 0 ? 'on' : '';
    if (phase === 'build') return i === 0 ? 'done' : (i === 1 || i === 2) ? 'on' : '';
    return i === 3 ? 'on' : 'done'; // review
  };
  return (
    <div className="mara-stepper">
      {STEPS.map((label, i) => {
        const st = stateFor(i);
        return (
          <span key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <span className={`mara-step ${st}`}>
              <span className="n">{st === 'done' ? <Icon name="check" size={13} /> : i + 1}</span>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mara-stepline" />}
          </span>
        );
      })}
    </div>
  );
}

export default function MarathonWizardPage() {
  const navigate = useNavigate();
  const { showError } = useToast();

  const [phase, setPhase] = useState('source');       // source | build | review
  const [marathonId, setMarathonId] = useState(null);
  const [name, setName] = useState('');
  const [source, setSource] = useState('manual');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  // cadence
  const [repeat, setRepeat] = useState('weekly');     // daily | weekly | custom
  const [customN, setCustomN] = useState(2);
  const [customUnit, setCustomUnit] = useState('week');
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 3 * 864e5)));

  const [dragIndex, setDragIndex] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const stepDays = () => {
    if (repeat === 'daily') return 1;
    if (repeat === 'weekly') return 7;
    return Math.max(1, customN) * (customUnit === 'day' ? 1 : 7);
  };

  // ── Source step ──────────────────────────────────────────────────────────
  const startBuild = async () => {
    if (!name.trim()) return showError('Give the marathon a name');
    setBusy(true);
    try {
      const m = await api.createMarathon(name.trim());
      setMarathonId(m.id);
      setPhase('build');
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  // ── Lineup ───────────────────────────────────────────────────────────────
  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await api.searchTMDB(query.trim())); }
    catch (err) { showError(err.message); } finally { setSearching(false); }
  };

  const addMovie = async (r) => {
    setBusy(true);
    try {
      const detail = await api.getTMDBMovie(r.id);
      const item = await api.addMarathonItem(marathonId, toItemData(detail));
      setItems((prev) => [...prev, item]);
      setResults([]); setQuery('');
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const removeMovie = async (item) => {
    try {
      await api.removeMarathonItem(marathonId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) { showError(err.message); }
  };

  const onDrop = (idx) => {
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); setDragOver(null); return; }
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(null); setDragOver(null);
  };

  const setItemDate = (idx, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, scheduled_at: value } : it)));

  const autofill = () => {
    const base = new Date(start);
    const stepMs = stepDays() * 864e5;
    setItems((prev) => prev.map((it, i) => ({
      ...it, scheduled_at: toLocalInput(new Date(base.getTime() + i * stepMs))
    })));
  };

  const goReview = () => {
    if (items.length === 0) return showError('Add at least one film');
    if (items.some((it) => !it.scheduled_at)) autofill();
    setPhase('review');
  };

  // ── Launch ─────────────────────────────────────────────────────────────
  const launch = async () => {
    if (items.some((it) => !it.scheduled_at)) return showError('Every film needs a date');
    setBusy(true);
    try {
      await api.reorderMarathonItems(marathonId, items.map((i) => i.id));
      await api.launchMarathon(marathonId, 'interval',
        items.map((i) => ({ id: i.id, scheduled_at: new Date(i.scheduled_at).toISOString() })));
      navigate(`/marathons/${marathonId}`);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const cadenceLabel = repeat === 'daily' ? 'Daily'
    : repeat === 'weekly' ? 'Weekly'
    : `Every ${customN} ${customUnit}${customN > 1 ? 's' : ''}`;

  return (
    <div className="mara-wizard">
      <Stepper phase={phase} />

      {/* ── SOURCE ─────────────────────────────────────────────────────── */}
      {phase === 'source' && (
        <>
          <div className="mara-wiz-head">
            <h1>New marathon</h1>
            <p>Name it, then choose how to fill the lineup. However you build it, the next steps are the same.</p>
          </div>

          <div className="mara-namewrap">
            <label className="mara-label">Marathon name</label>
            <input className="mara-name" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. The Nolan Batman Trilogy" autoFocus />
          </div>

          <div className="mara-srcgrid">
            {SOURCES.map((s) => (
              <button key={s.key} type="button"
                className={`mara-src ${source === s.key ? 'sel' : ''} ${s.enabled ? '' : 'disabled'}`}
                onClick={() => s.enabled && setSource(s.key)} disabled={!s.enabled}>
                {source === s.key && s.enabled && <span className="check"><Icon name="check-circle" size={18} /></span>}
                <div className="ic"><Icon name={s.icon} size={20} /></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <span className="tag">{s.tag}</span>
              </button>
            ))}
          </div>

          <div className="mara-wiz-footer">
            <button className="btn ghost" onClick={() => navigate('/marathons')}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={startBuild}>
              Next: build the lineup <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </>
      )}

      {/* ── BUILD (lineup + schedule) ──────────────────────────────────── */}
      {phase === 'build' && (
        <>
          <div className="mara-wiz-head">
            <h1>Build &amp; schedule the lineup</h1>
            <p>Drag to reorder. Pick a cadence to auto-fill dates — then fine-tune any night by hand.</p>
          </div>

          <div className="mara-build">
            {/* LINEUP */}
            <div>
              <label className="mara-label">Lineup · {items.length} film{items.length === 1 ? '' : 's'}</label>

              <form className="mara-searchrow" onSubmit={search}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search TMDB to add a film…" />
                <button className="btn ghost" type="submit" disabled={searching}><Icon name="search" size={16} /></button>
              </form>

              {results.length > 0 && (
                <div className="mara-results">
                  {results.map((r) => (
                    <div key={r.id} className="mara-li result">
                      <div className="thumb" style={{ backgroundImage: r.posterPath ? `url(${r.posterPath})` : 'none' }} />
                      <div className="grow"><h4>{r.title}</h4><div className="sub">{r.year || '—'}</div></div>
                      <button className="mara-iconbtn" onClick={() => addMovie(r)} disabled={busy}><Icon name="plus" size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mara-hintline"><Icon name="info" size={14} /> Dates come from the cadence — override any one on the right.</div>

              {items.map((it, idx) => (
                <div key={it.id}
                  className={`mara-li ${dragIndex === idx ? 'dragging' : ''} ${dragOver === idx ? 'dragover' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
                  onDragLeave={() => setDragOver((o) => (o === idx ? null : o))}
                  onDrop={() => onDrop(idx)}
                  onDragEnd={() => { setDragIndex(null); setDragOver(null); }}>
                  <span className="grip"><Icon name="grip" size={15} /></span>
                  <span className="pos">{idx + 1}</span>
                  <div className="thumb" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
                  <div className="grow">
                    <h4>{it.title}</h4>
                    <div className="sub">{it.release_year || '—'}{it.runtime ? ` · ${it.runtime}m` : ''}</div>
                  </div>
                  <input className="li-date" type="datetime-local" value={it.scheduled_at || ''}
                         onChange={(e) => setItemDate(idx, e.target.value)} />
                  <button className="mara-iconbtn danger" onClick={() => removeMovie(it)}><Icon name="close" size={15} /></button>
                </div>
              ))}
            </div>

            {/* SCHEDULE */}
            <div className="mara-panel">
              <label className="mara-label">Cadence <span className="sublabel">— a template for the dates</span></label>
              <div className="mara-modes">
                <button type="button" className="mara-mode sel">
                  <span className="ic"><Icon name="calendar-clock" size={18} /></span>
                  <h4>Spread out</h4><p>One film per interval, over time</p>
                </button>
                <button type="button" className="mara-mode disabled" disabled>
                  <span className="tag">Soon</span>
                  <span className="ic"><Icon name="film" size={18} /></span>
                  <h4>Back-to-back</h4><p>All in one sitting, by runtime</p>
                </button>
              </div>

              <label className="mara-label">Repeat</label>
              <div className="mara-seg">
                {['daily', 'weekly', 'custom'].map((r) => (
                  <button key={r} type="button" className={repeat === r ? 'on' : ''} onClick={() => setRepeat(r)}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              {repeat === 'custom' && (
                <div className="mara-field">
                  <label className="mara-label">Every</label>
                  <div className="mara-inrow">
                    <input type="number" min="1" value={customN}
                           onChange={(e) => setCustomN(Math.max(1, parseInt(e.target.value) || 1))} style={{ maxWidth: 90 }} />
                    <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}>
                      <option value="day">day(s)</option>
                      <option value="week">week(s)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="mara-field">
                <label className="mara-label">Starts</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: '100%' }} />
              </div>

              <button className="btn ghost" style={{ width: '100%' }} onClick={autofill}>
                <Icon name="wand" size={15} /> Auto-fill dates
              </button>

              <div className="mara-rollnote">
                <Icon name="info" size={16} />
                <p><b>Rolls out one at a time.</b> Only the next film posts to Discord; the rest stay editable and you can pause between any two.</p>
              </div>
            </div>
          </div>

          <div className="mara-wiz-footer">
            <button className="btn ghost" onClick={() => setPhase('source')}>Back</button>
            <button className="btn btn-primary" onClick={goReview}>Review &amp; launch <Icon name="arrow-right" size={16} /></button>
          </div>
        </>
      )}

      {/* ── REVIEW ─────────────────────────────────────────────────────── */}
      {phase === 'review' && (
        <>
          <div className="mara-wiz-head">
            <h1>Review &amp; launch</h1>
            <p>Once launched, the bot queues the next film automatically as its date approaches.</p>
          </div>

          <div className="mara-review-sum">
            <div className="row"><span className="k">Marathon</span><span className="v">{name}</span></div>
            <div className="row"><span className="k">Films</span><span className="v">{items.length}</span></div>
            <div className="row"><span className="k">Cadence</span><span className="v">{cadenceLabel}</span></div>
            <div className="row"><span className="k">First film</span><span className="v">{fmtShort(items[0]?.scheduled_at)}</span></div>
            <div className="row"><span className="k">Last film</span><span className="v">{fmtShort(items[items.length - 1]?.scheduled_at)}</span></div>
          </div>

          <div className="mara-rollnote" style={{ marginTop: 18 }}>
            <Icon name="info" size={16} />
            <p><b>{items[0]?.title}</b> posts first. Everything after it stays editable until it becomes next-up.</p>
          </div>

          <div className="mara-wiz-footer">
            <button className="btn ghost" onClick={() => setPhase('build')}>Back</button>
            <button className="btn btn-primary" disabled={busy} onClick={launch}>
              <Icon name="rocket" size={16} /> Launch marathon
            </button>
          </div>
        </>
      )}
    </div>
  );
}
