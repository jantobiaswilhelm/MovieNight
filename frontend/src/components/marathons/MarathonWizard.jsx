import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as api from '../../api/client';
import { Icon } from '../ui';

// Map GET /api/tmdb/:id detail shape → the tmdb_data our item endpoint expects.
const toItemData = (d) => ({
  tmdbId: d.id, title: d.title, imageUrl: d.posterPath, backdropUrl: d.backdropPath,
  description: d.overview, tmdbRating: d.rating, genres: d.genres, runtime: d.runtime,
  releaseYear: d.year, tagline: d.tagline, imdbId: d.imdbId,
  originalLanguage: d.originalLanguage, trailerUrl: d.trailerUrl
});

// Local pad helper for datetime-local values.
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export default function MarathonWizard({ onClose, onLaunched }) {
  const { showError } = useToast();
  const [step, setStep] = useState(1);           // 1 name, 2 lineup, 3 schedule
  const [marathonId, setMarathonId] = useState(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);        // {id, title, image_url, runtime, release_year, scheduled_at}
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  // cadence
  const [unit, setUnit] = useState('week');      // 'day' | 'week'
  const [interval, setIntervalN] = useState(1);
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 3 * 864e5)));

  // Step 1 → create the draft so we have an id to attach items to.
  const createDraft = async () => {
    if (!name.trim()) return showError('Give the marathon a name');
    setBusy(true);
    try {
      const m = await api.createMarathon(name.trim());
      setMarathonId(m.id);
      setStep(2);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

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
      const detail = await api.getTMDBMovie(r.id);       // full metadata
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

  const move = (idx, dir) => {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  // Compute a date per item from the cadence, then let the user edit each.
  const autofill = () => {
    const base = new Date(start);
    const stepMs = (unit === 'day' ? 1 : 7) * interval * 864e5;
    setItems((prev) => prev.map((it, i) => ({
      ...it, scheduled_at: toLocalInput(new Date(base.getTime() + i * stepMs))
    })));
  };

  const setItemDate = (idx, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, scheduled_at: value } : it)));

  const goSchedule = () => {
    if (items.length === 0) return showError('Add at least one film');
    autofill();
    setStep(3);
  };

  const launch = async () => {
    if (items.some((it) => !it.scheduled_at)) return showError('Every film needs a date');
    // Persist order first (in case the user reordered), then launch with dates.
    setBusy(true);
    try {
      await api.reorderMarathonItems(marathonId, items.map((i) => i.id));
      await api.launchMarathon(marathonId, 'interval',
        items.map((i) => ({ id: i.id, scheduled_at: new Date(i.scheduled_at).toISOString() })));
      onLaunched(marathonId);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="mara-overlay" onClick={onClose}>
      <div className="mara-modal" onClick={(e) => e.stopPropagation()}>
        {step === 1 && (
          <>
            <h2>New marathon</h2>
            <div className="mara-field">
              <label className="mara-label">Marathon name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="e.g. The Nolan Batman Trilogy" autoFocus />
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={createDraft}>Next: add films</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Add films</h2>
            <form className="mara-field" onSubmit={search}>
              <label className="mara-label">Search movies</label>
              <div className="mara-row">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search TMDB…" />
                <button className="btn ghost" type="submit" disabled={searching}>
                  <Icon name="search" size={16} />
                </button>
              </div>
            </form>
            {results.length > 0 && (
              <div className="mara-search-results">
                {results.map((r) => (
                  <div key={r.id} className="mara-item">
                    <div className="thumb" style={{ backgroundImage: r.posterPath ? `url(${r.posterPath})` : 'none' }} />
                    <div className="grow"><h4>{r.title}</h4><div className="sub">{r.year || '—'}</div></div>
                    <button className="mara-iconbtn" onClick={() => addMovie(r)} disabled={busy}>
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mara-field">
              <label className="mara-label">Lineup · {items.length}</label>
              {items.map((it, idx) => (
                <div key={it.id} className="mara-item">
                  <span className="pos">{idx + 1}</span>
                  <div className="thumb" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
                  <div className="grow">
                    <h4>{it.title}</h4>
                    <div className="sub">{it.release_year || '—'}{it.runtime ? ` · ${it.runtime}m` : ''}</div>
                  </div>
                  <button className="mara-iconbtn" onClick={() => move(idx, -1)}><Icon name="chevron-up" size={16} /></button>
                  <button className="mara-iconbtn" onClick={() => move(idx, 1)}><Icon name="chevron" size={16} /></button>
                  <button className="mara-iconbtn danger" onClick={() => removeMovie(it)}><Icon name="close" size={16} /></button>
                </div>
              ))}
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={goSchedule}>Next: schedule</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Schedule</h2>
            <div className="mara-field">
              <label className="mara-label">Repeat</label>
              <div className="mara-row">
                <input type="number" min="1" value={interval}
                       onChange={(e) => setIntervalN(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 80 }} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="day">day(s)</option>
                  <option value="week">week(s)</option>
                </select>
                <label className="mara-label" style={{ margin: 0 }}>starting</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                <button className="btn ghost" onClick={autofill}>Auto-fill dates</button>
              </div>
            </div>
            <div className="mara-field">
              <label className="mara-label">Dates — edit any by hand</label>
              {items.map((it, idx) => (
                <div key={it.id} className="mara-item">
                  <span className="pos">{idx + 1}</span>
                  <div className="grow"><h4>{it.title}</h4></div>
                  <input type="datetime-local" value={it.scheduled_at || ''}
                         onChange={(e) => setItemDate(idx, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={launch}>Launch marathon</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
