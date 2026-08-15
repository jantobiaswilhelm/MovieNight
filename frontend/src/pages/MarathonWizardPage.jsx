import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import MarathonSourcePicker from '../components/marathons/MarathonSourcePicker';
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

// The source cards, their panels, and the reviewable preview list all live in
// <MarathonSourcePicker> — shared with the add-films page.

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
  const [searchParams] = useSearchParams();
  const { showError } = useToast();

  const [phase, setPhase] = useState('source');       // source | build | review
  const [marathonId, setMarathonId] = useState(null);
  const [name, setName] = useState('');
  // What the shared source picker currently has selected.
  const [picked, setPicked] = useState({ source: 'manual', preview: [], selectedIds: new Set() });
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  // cadence
  const [cadenceMode, setCadenceMode] = useState('interval');  // 'interval' | 'binge'
  const [repeat, setRepeat] = useState('weekly');     // daily | weekly | custom
  const [customN, setCustomN] = useState(2);
  const [customUnit, setCustomUnit] = useState('week');
  const [breakMin, setBreakMin] = useState(15);
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 3 * 864e5)));

  const [dragIndex, setDragIndex] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // A "Start from a set" card links in with ?source=… — the picker opens there.
  const initialSource = (() => {
    const qs = searchParams.get('source');
    return qs && ['person', 'franchise', 'vibe'].includes(qs) ? qs : 'manual';
  })();

  // Stable, because the picker holds it in a ref and fires it on every change.
  const handlePicked = useCallback((next) => setPicked(next), []);
  const suggestName = useCallback((suggested) => setName((n) => (n.trim() ? n : suggested)), []);

  const stepDays = () => {
    if (repeat === 'daily') return 1;
    if (repeat === 'weekly') return 7;
    return Math.max(1, customN) * (customUnit === 'day' ? 1 : 7);
  };

  // ── Source step ──────────────────────────────────────────────────────────
  // Manual → empty lineup (search on the Build step). Other sources → bulk-add
  // the resolved preview after creating the draft. All land on the Build step.
  const startBuild = async () => {
    if (!name.trim()) return showError('Give the marathon a name');
    const { source, preview, selectedIds } = picked;
    let chosen = [];
    if (source !== 'manual') {
      if (preview.length === 0) return showError('Build a lineup from your chosen source first');
      chosen = preview.filter((p) => selectedIds.has(p.tmdbId)).map((p) => p.tmdbId);
      if (chosen.length === 0) return showError('Pick at least one film from your source');
    }
    setBusy(true);
    try {
      const m = await api.createMarathon(name.trim());
      setMarathonId(m.id);
      if (source !== 'manual') {
        const added = await api.bulkAddMarathonItems(m.id, chosen);
        setItems(added);
      }
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
    if (cadenceMode === 'binge') {
      let cursor = new Date(start).getTime();
      setItems((prev) => prev.map((it) => {
        const at = toLocalInput(new Date(cursor));
        cursor += ((it.runtime || 120) + breakMin) * 60000;   // next film after runtime + break
        return { ...it, scheduled_at: at };
      }));
      return;
    }
    const base = new Date(start);
    const stepMs = stepDays() * 864e5;
    setItems((prev) => prev.map((it, i) => ({
      ...it, scheduled_at: toLocalInput(new Date(base.getTime() + i * stepMs))
    })));
  };

  const goReview = () => {
    if (items.length === 0) return showError('Add at least one film');
    // Dates are optional now — undated films launch as "TBD" and roll out once
    // you give them a date. Auto-fill stays a one-click convenience on the left.
    setPhase('review');
  };

  const clearItemDate = (idx) => setItemDate(idx, '');
  const datedCount = items.filter((it) => it.scheduled_at).length;

  // ── Launch ─────────────────────────────────────────────────────────────
  const launch = async () => {
    if (items.length === 0) return showError('Add at least one film');
    setBusy(true);
    try {
      await api.reorderMarathonItems(marathonId, items.map((i) => i.id));
      await api.launchMarathon(marathonId, cadenceMode,
        items.map((i) => ({ id: i.id, scheduled_at: i.scheduled_at ? new Date(i.scheduled_at).toISOString() : null })));
      navigate(`/marathons/${marathonId}`);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const cadenceLabel = cadenceMode === 'binge' ? 'Back-to-back'
    : repeat === 'daily' ? 'Daily'
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

          <MarathonSourcePicker
            manualMode="defer"
            initialSource={initialSource}
            onChange={handlePicked}
            onSuggestName={suggestName} />

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

              <div className="mara-hintline"><Icon name="info" size={14} /> Dates are optional — auto-fill from the cadence, set one by hand, or leave a film <b>TBD</b> to date later.</div>

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
                  <div className="li-datewrap">
                    <input className="li-date" type="datetime-local" value={it.scheduled_at || ''}
                           onChange={(e) => setItemDate(idx, e.target.value)} />
                    {it.scheduled_at
                      ? <button type="button" className="li-tbd" title="Clear date (TBD)" onClick={() => clearItemDate(idx)}>Clear</button>
                      : <span className="li-tbd is-tbd">TBD</span>}
                  </div>
                  <button className="mara-iconbtn danger" onClick={() => removeMovie(it)}><Icon name="close" size={15} /></button>
                </div>
              ))}
            </div>

            {/* SCHEDULE */}
            <div className="mara-panel">
              <label className="mara-label">Cadence <span className="sublabel">— a template for the dates</span></label>
              <div className="mara-modes">
                <button type="button" className={`mara-mode ${cadenceMode === 'interval' ? 'sel' : ''}`}
                  onClick={() => setCadenceMode('interval')}>
                  <span className="ic"><Icon name="calendar-clock" size={18} /></span>
                  <h4>Spread out</h4><p>One film per interval, over time</p>
                </button>
                <button type="button" className={`mara-mode ${cadenceMode === 'binge' ? 'sel' : ''}`}
                  onClick={() => setCadenceMode('binge')}>
                  <span className="ic"><Icon name="film" size={18} /></span>
                  <h4>Back-to-back</h4><p>All in one sitting, by runtime</p>
                </button>
              </div>

              {cadenceMode === 'interval' && (
                <>
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
                </>
              )}

              {cadenceMode === 'binge' && (
                <div className="mara-field">
                  <label className="mara-label">Break between films (min)</label>
                  <input type="number" min="0" value={breakMin}
                         onChange={(e) => setBreakMin(Math.max(0, parseInt(e.target.value) || 0))} style={{ maxWidth: 110 }} />
                </div>
              )}

              <div className="mara-field">
                <label className="mara-label">{cadenceMode === 'binge' ? 'Doors open' : 'Starts'}</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: '100%' }} />
              </div>

              <button className="btn ghost" style={{ width: '100%' }} onClick={autofill}>
                <Icon name="wand" size={15} /> Auto-fill dates
              </button>

              <div className="mara-rollnote">
                <Icon name="info" size={16} />
                {cadenceMode === 'binge'
                  ? <p><b>One night, one embed.</b> The whole lineup posts as a single Discord kickoff — each film still becomes a rateable movie night.</p>
                  : <p><b>Rolls out one at a time.</b> Only the next film posts to Discord; the rest stay editable and you can pause between any two.</p>}
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
            <div className="row"><span className="k">Films</span><span className="v">{items.length}{datedCount < items.length ? ` · ${items.length - datedCount} TBD` : ''}</span></div>
            <div className="row"><span className="k">Cadence</span><span className="v">{cadenceLabel}</span></div>
            {(() => {
              const dated = items.filter((it) => it.scheduled_at);
              return (
                <>
                  <div className="row"><span className="k">First film</span><span className="v">{fmtShort(dated[0]?.scheduled_at)}</span></div>
                  <div className="row"><span className="k">Last film</span><span className="v">{fmtShort(dated[dated.length - 1]?.scheduled_at)}</span></div>
                </>
              );
            })()}
          </div>

          <div className="mara-rollnote" style={{ marginTop: 18 }}>
            <Icon name="info" size={16} />
            {datedCount === 0
              ? <p><b>All films are TBD.</b> Nothing posts to Discord until you give a film a date — set dates any time from the marathon page.</p>
              : <p><b>{(items.find((it) => it.scheduled_at) || items[0])?.title}</b> posts first. Undated (TBD) films wait until you date them; everything stays editable until it becomes next-up.</p>}
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
