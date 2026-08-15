import { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import * as api from '../../api/client';
import { Icon } from '../ui';

// The four ways to fill a lineup, shared by the create wizard's Source step and
// the "add films to a running marathon" page so the two can't drift apart.
// The "vibe" card only appears when Gemini curation is configured.
export const SOURCES = [
  { key: 'manual',    icon: 'search',   title: 'Pick movies yourself',          desc: 'Search TMDB and add films one by one. Full control over order.', tag: 'Manual' },
  { key: 'person',    icon: 'user',     title: 'By actor, actress, or director', desc: 'Search a person → pull their films straight from TMDB. Zero guesswork.', tag: 'TMDB credits' },
  { key: 'franchise', icon: 'layers',   title: 'From a franchise',              desc: 'Grab a whole collection in order — trilogies, sagas.', tag: 'Collections' },
  { key: 'vibe',      icon: 'sparkles', title: 'Describe a vibe',               desc: 'Describe a mood or theme and get a lineup you review before it schedules.', tag: 'AI · Gemini' },
];

export const EX_CHIPS = ['Feel-good heist movies', '90s cult classics', 'Movies set in space', 'A24 horror'];

/**
 * Source cards + their panels + the reviewable preview list.
 *
 * manualMode
 *   'defer'  — the wizard: picking "manual" starts an empty lineup and search
 *              happens on the next step, so the card selects and shows nothing.
 *   'search' — the add-films page: "manual" searches TMDB right here and pushes
 *              hits into the same preview list every other source feeds.
 *
 * onChange must be referentially stable (wrap it in useCallback) — it is held in
 * a ref and fired whenever the selection changes.
 */
export default function MarathonSourcePicker({
  manualMode = 'defer',
  excludeTmdbIds,
  initialSource = 'manual',
  onChange,
  onSuggestName,
}) {
  const { showError } = useToast();

  const [source, setSource] = useState(initialSource);
  const [curateAvailable, setCurateAvailable] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);

  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [personRole, setPersonRole] = useState('acting');
  const [franchiseQuery, setFranchiseQuery] = useState('');
  const [franchiseHits, setFranchiseHits] = useState([]);
  const [vibe, setVibe] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [manualHits, setManualHits] = useState([]);

  const [preview, setPreview] = useState([]);              // [{tmdbId,title,year,posterPath}]
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const excluded = excludeTmdbIds || new Set();
  const isExcluded = (tmdbId) => excluded.has(tmdbId);

  // Held in a ref so the notify effect doesn't refire when the parent
  // re-renders with a new closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSuggestNameRef = useRef(onSuggestName);
  onSuggestNameRef.current = onSuggestName;

  useEffect(() => {
    onChangeRef.current?.({ source, preview, selectedIds });
  }, [source, preview, selectedIds]);

  useEffect(() => {
    api.getCurateStatus()
      .then((r) => {
        setCurateAvailable(!!r.available);
        if (!r.available) setSource((s) => (s === 'vibe' ? 'manual' : s));
      })
      .catch(() => setCurateAvailable(false));
  }, []);

  // Set the preview and default every not-already-present film to selected.
  const applyPreview = (list) => {
    setPreview(list);
    setSelectedIds(new Set(list.filter((p) => !isExcluded(p.tmdbId)).map((p) => p.tmdbId)));
  };

  const toggleSelected = (tmdbId) => {
    if (isExcluded(tmdbId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
      return next;
    });
  };

  const selectable = preview.filter((p) => !isExcluded(p.tmdbId));
  const allSelected = selectable.length > 0 && selectedIds.size === selectable.length;
  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(selectable.map((p) => p.tmdbId)));

  const chooseSource = (key) => {
    setSource(key);
    setPreview([]); setSelectedIds(new Set());
    setManualHits([]); setPeople([]); setFranchiseHits([]);
  };

  const run = async (fn) => {
    setSourceBusy(true);
    try { await fn(); }
    catch (err) { showError(err.message); }
    finally { setSourceBusy(false); }
  };

  const searchPerson = (e) => {
    e.preventDefault();
    if (!personQuery.trim()) return;
    run(async () => setPeople(await api.searchTMDBPerson(personQuery.trim())));
  };

  const pickPerson = (person) => run(async () => {
    applyPreview(await api.getPersonMovies(person.id, personRole));
    setPeople([]); setPersonQuery(person.name);
    onSuggestNameRef.current?.(`${person.name} Marathon`);
  });

  const searchFranchise = (e) => {
    e.preventDefault();
    if (!franchiseQuery.trim()) return;
    run(async () => setFranchiseHits(await api.searchTMDB(franchiseQuery.trim())));
  };

  const pickFranchise = (movie) => run(async () => {
    const { name: cName, parts } = await api.getMovieCollection(movie.id);
    if (!parts.length) { showError('That film isn’t part of a franchise on TMDB — try another.'); return; }
    applyPreview(parts); setFranchiseHits([]); setFranchiseQuery(cName || movie.title);
    if (cName) onSuggestNameRef.current?.(cName);
  });

  const generateVibe = () => {
    if (!vibe.trim()) return showError('Describe the vibe first');
    run(async () => applyPreview(await api.curateMarathon(vibe.trim())));
  };

  const searchManual = (e) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    run(async () => setManualHits(await api.searchTMDB(manualQuery.trim())));
  };

  // Manual search feeds the same preview list the other sources build, so the
  // consumer only ever reads one selection shape.
  const addManualHit = (mv) => {
    if (preview.some((p) => p.tmdbId === mv.id)) return;
    const film = { tmdbId: mv.id, title: mv.title, year: mv.year, posterPath: mv.posterPath };
    setPreview((prev) => [...prev, film]);
    setSelectedIds((prev) => new Set(prev).add(mv.id));
    setManualHits([]); setManualQuery('');
  };

  const visibleSources = SOURCES.filter((s) => s.key !== 'vibe' || curateAvailable);

  return (
    <>
      <div className="mara-srcgrid">
        {visibleSources.map((s) => (
          <button key={s.key} type="button"
            className={`mara-src ${source === s.key ? 'sel' : ''}`}
            onClick={() => chooseSource(s.key)}>
            {source === s.key && <span className="check"><Icon name="check-circle" size={18} /></span>}
            <div className="ic"><Icon name={s.icon} size={20} /></div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
            <span className="tag">{s.tag}</span>
          </button>
        ))}
      </div>

      {source === 'manual' && manualMode === 'search' && (
        <div className="mara-srcpanel">
          <form className="mara-searchrow" onSubmit={searchManual}>
            <input value={manualQuery} onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Search TMDB for a film…" />
            <button className="btn ghost" type="submit" disabled={sourceBusy}><Icon name="search" size={16} /></button>
          </form>
          {manualHits.length > 0 && (
            <div className="mara-results">
              {manualHits.map((mv) => {
                const already = isExcluded(mv.id) || preview.some((p) => p.tmdbId === mv.id);
                return (
                  <div key={mv.id} className="mara-li result">
                    <div className="thumb" style={{ backgroundImage: mv.posterPath ? `url(${mv.posterPath})` : 'none' }} />
                    <div className="grow"><h4>{mv.title}</h4><div className="sub">{mv.year || '—'}</div></div>
                    <button className="btn ghost" onClick={() => addManualHit(mv)} disabled={sourceBusy || already}>
                      {already ? 'Already in' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {source === 'person' && (
        <div className="mara-srcpanel">
          <div className="mara-seg" style={{ maxWidth: 280, marginBottom: 14 }}>
            {['acting', 'directing'].map((r) => (
              <button key={r} type="button" className={personRole === r ? 'on' : ''}
                onClick={() => setPersonRole(r)}>{r === 'acting' ? 'As actor/actress' : 'As director'}</button>
            ))}
          </div>
          <form className="mara-searchrow" onSubmit={searchPerson}>
            <input value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} placeholder="Search an actor, actress, or director…" />
            <button className="btn ghost" type="submit" disabled={sourceBusy}><Icon name="search" size={16} /></button>
          </form>
          {people.length > 0 && (
            <div className="mara-results">
              {people.map((p) => (
                <div key={p.id} className="mara-li result">
                  <div className="thumb" style={{ backgroundImage: p.profilePath ? `url(${p.profilePath})` : 'none' }} />
                  <div className="grow"><h4>{p.name}</h4><div className="sub">{p.department}{p.knownFor ? ` · ${p.knownFor}` : ''}</div></div>
                  <button className="btn ghost" onClick={() => pickPerson(p)} disabled={sourceBusy}>Use</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {source === 'franchise' && (
        <div className="mara-srcpanel">
          <form className="mara-searchrow" onSubmit={searchFranchise}>
            <input value={franchiseQuery} onChange={(e) => setFranchiseQuery(e.target.value)} placeholder="Search any film in the franchise…" />
            <button className="btn ghost" type="submit" disabled={sourceBusy}><Icon name="search" size={16} /></button>
          </form>
          {franchiseHits.length > 0 && (
            <div className="mara-results">
              {franchiseHits.map((mv) => (
                <div key={mv.id} className="mara-li result">
                  <div className="thumb" style={{ backgroundImage: mv.posterPath ? `url(${mv.posterPath})` : 'none' }} />
                  <div className="grow"><h4>{mv.title}</h4><div className="sub">{mv.year || '—'}</div></div>
                  <button className="btn ghost" onClick={() => pickFranchise(mv)} disabled={sourceBusy}>Use collection</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {source === 'vibe' && curateAvailable && (
        <div className="mara-srcpanel vibe">
          <div className="mara-searchrow">
            <textarea className="mara-vibe" value={vibe} onChange={(e) => setVibe(e.target.value)}
              placeholder="e.g. cozy rainy-day sci-fi that isn’t too heavy" rows={2} />
            <button className="btn btn-primary" onClick={generateVibe} disabled={sourceBusy}>
              <Icon name="sparkles" size={15} /> Generate
            </button>
          </div>
          <div className="mara-chips">
            {EX_CHIPS.map((c) => <button key={c} type="button" onClick={() => setVibe(c)}>{c}</button>)}
          </div>
          <div className="mara-guardrail"><Icon name="info" size={13} /> Every suggestion is matched to a real TMDB film and shown for your review — hallucinated titles are dropped before anything schedules.</div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mara-srcpanel">
          <div className="mara-preview-head">
            <label className="mara-label" style={{ margin: 0 }}>Pick films · {selectedIds.size} of {selectable.length} selected</label>
            <button type="button" className="btn text" onClick={toggleAll}>{allSelected ? 'Clear all' : 'Select all'}</button>
          </div>
          {preview.map((p) => {
            const already = isExcluded(p.tmdbId);
            const on = selectedIds.has(p.tmdbId);
            return (
              <button type="button" key={p.tmdbId} className={`mara-li pick ${on ? 'on' : ''} ${already ? 'already' : ''}`}
                disabled={already} onClick={() => toggleSelected(p.tmdbId)}>
                <span className="mara-check">{on && <Icon name="check" size={13} />}</span>
                <div className="thumb" style={{ backgroundImage: p.posterPath ? `url(${p.posterPath})` : 'none' }} />
                <div className="grow">
                  <h4>{p.title}</h4>
                  <div className="sub">{p.year || '—'}{already ? ' · already in this marathon' : ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
