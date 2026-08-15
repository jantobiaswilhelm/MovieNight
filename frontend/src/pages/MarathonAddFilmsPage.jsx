import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import MarathonSourcePicker from '../components/marathons/MarathonSourcePicker';
import { inferRhythm, offsetLabel, findQueueJumpers } from '../components/marathons/rhythm';
import './MarathonsPage.css';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtWhen = (v) =>
  v ? new Date(v).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function MarathonAddFilmsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [marathon, setMarathon] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [phase, setPhase] = useState('pick');          // pick | dates
  const [chosen, setChosen] = useState([]);            // [{tmdbId,title,year,posterPath}]
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dates, setDates] = useState([]);              // parallel to chosen: '' = TBD

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const m = await api.getMarathon(id);
        if (!live) return;
        setMarathon(m);
        if (!m.is_owner) { setBlocked('Only the host of this marathon can add films to it.'); return; }
        try {
          const s = await api.getMarathonSuggestions(id);
          if (!live) return;
          setSuggestions(s);
          // Open the picker up front when the theme can't drive picks: a genre
          // label is descriptive only (no TMDB discover endpoint), so its rows
          // are just pooled recommendations.
          if (!s.theme || s.theme.kind === 'genre') setPickerOpen(true);
        } catch (err) {
          if (!live) return;
          // 409 = adding is refused outright (a binge night already announced).
          // Anything else (TMDB down, no key) just costs us the suggestions —
          // the source picker still works, so fall through to it.
          if (err.status === 409) setBlocked(err.message);
          else { setSuggestions({ theme: null, rows: [] }); setPickerOpen(true); }
        }
      } catch (err) {
        if (live) showError(err.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [id, showError]);

  const items = marathon?.items || [];
  const inLineup = useMemo(
    () => new Set(items.map((it) => it.tmdb_id).filter(Boolean)),
    [items]
  );
  const rhythm = useMemo(
    () => (marathon ? inferRhythm(items, marathon.cadence_type) : null),
    [marathon, items]
  );

  const isChosen = (tmdbId) => chosen.some((c) => c.tmdbId === tmdbId);
  const toggleFilm = (film) => setChosen((prev) =>
    prev.some((c) => c.tmdbId === film.tmdbId)
      ? prev.filter((c) => c.tmdbId !== film.tmdbId)
      : [...prev, film]);

  const toggleRow = (row) => {
    const addable = row.films.filter((f) => !inLineup.has(f.tmdbId));
    const allOn = addable.every((f) => isChosen(f.tmdbId));
    setChosen((prev) => allOn
      ? prev.filter((c) => !addable.some((f) => f.tmdbId === c.tmdbId))
      : [...prev, ...addable.filter((f) => !prev.some((c) => c.tmdbId === f.tmdbId))]);
  };

  // The picker keeps its own selection; mirror it into `chosen` without losing
  // anything ticked in the suggestion rows above.
  const suggestedIds = useMemo(
    () => new Set((suggestions?.rows || []).flatMap((r) => r.films.map((f) => f.tmdbId))),
    [suggestions]
  );
  const handlePicked = useCallback(({ preview, selectedIds }) => {
    setChosen((prev) => {
      // Keep what the rows above have ticked, swap in what the picker has now,
      // and dedupe — a film can legitimately appear in both places.
      const kept = prev.filter((c) => suggestedIds.has(c.tmdbId));
      const merged = [...kept];
      for (const p of preview) {
        if (selectedIds.has(p.tmdbId) && !merged.some((c) => c.tmdbId === p.tmdbId)) merged.push(p);
      }
      return merged;
    });
  }, [suggestedIds]);

  const goToDates = () => {
    if (chosen.length === 0) return showError('Pick at least one film');
    setDates(chosen.map((film, i) => {
      if (!rhythm) return '';
      const prior = chosen.slice(0, i);
      return toLocalInput(rhythm.nextDateFor(i, prior));
    }));
    setPhase('dates');
    window.scrollTo({ top: 0 });
  };

  const setDateAt = (i, value) => setDates((prev) => prev.map((d, j) => (j === i ? value : d)));

  const jumpers = useMemo(
    () => findQueueJumpers(items, chosen.map((film, i) => ({ film, date: dates[i] }))),
    [items, chosen, dates]
  );

  const confirm = async () => {
    setBusy(true);
    try {
      const added = await api.bulkAddMarathonItems(id, chosen.map((c) => c.tmdbId));
      // Bulk-add appends in the order sent, so returned items line up with
      // `chosen` — but match on tmdb_id rather than trusting the index.
      await Promise.all(added.map((item) => {
        const idx = chosen.findIndex((c) => c.tmdbId === item.tmdb_id);
        const value = idx >= 0 ? dates[idx] : '';
        if (!value) return null;
        return api.updateMarathonItemDate(id, item.id, new Date(value).toISOString());
      }).filter(Boolean));
      showSuccess(`Added ${added.length} film${added.length === 1 ? '' : 's'}`);
      navigate(`/marathons/${id}`);
    } catch (err) {
      showError(err.message);
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mara-wizard"><p className="muted">Loading…</p></div>;

  if (blocked) {
    return (
      <div className="mara-wizard">
        <button className="mara-back" onClick={() => navigate(`/marathons/${id}`)}>
          <Icon name="arrow-left" size={15} /> {marathon?.name || 'Back'}
        </button>
        <div className="mara-notice warn">
          <Icon name="alert-triangle" size={16} />
          <div>{blocked}</div>
        </div>
      </div>
    );
  }

  const datedCount = dates.filter(Boolean).length;

  return (
    <div className="mara-wizard mara-addfilms">
      <button className="mara-back" onClick={() =>
        (phase === 'dates' ? setPhase('pick') : navigate(`/marathons/${id}`))}>
        <Icon name="arrow-left" size={15} /> {phase === 'dates' ? 'Back to picking films' : marathon?.name}
      </button>

      {/* ── PICK ───────────────────────────────────────────────────────── */}
      {phase === 'pick' && (
        <>
          <div className="mara-wiz-head">
            <div className="mara-eyebrow2">
              <Icon name="plus" size={13} /> Adding films · {items.length} already in the lineup
            </div>
            <h1>What else should we watch?</h1>
            <p>We looked at what’s already in this marathon and worked out the through-line. Tick what you want — dates come next.</p>
          </div>

          {suggestions?.theme && (
            <div className="mara-theme">
              <div>
                <div className="k">This looks like</div>
                <h2>{suggestions.theme.label}</h2>
                <div className="ev"><Icon name="check-circle" size={13} /> {suggestions.theme.evidence}</div>
              </div>
              {!pickerOpen && (
                <button className="btn ghost" onClick={() => setPickerOpen(true)}>
                  <Icon name="close" size={14} /> That’s not it
                </button>
              )}
            </div>
          )}

          {!suggestions?.theme && (
            <div className="mara-notice">
              <Icon name="compass" size={16} />
              <div><b>These films don’t have an obvious through-line.</b> No shared director, cast, or franchise turned up — pick a source below and we’ll pull from TMDB.</div>
            </div>
          )}

          {(suggestions?.rows || []).map((row) => {
            const addable = row.films.filter((f) => !inLineup.has(f.tmdbId));
            const allOn = addable.length > 0 && addable.every((f) => isChosen(f.tmdbId));
            return (
              <div key={row.key}>
                <div className="mara-rowhead">
                  <div className="l">
                    <span className="mara-eyebrow2">{row.title}</span>
                    <span className="n">{row.note}</span>
                  </div>
                  <button className="btn text" onClick={() => toggleRow(row)}>
                    {allOn ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div className="mara-strip">
                  {row.films.map((f) => {
                    const already = inLineup.has(f.tmdbId);
                    const on = isChosen(f.tmdbId);
                    return (
                      <button type="button" key={f.tmdbId} disabled={already}
                        className={`mara-tile ${on ? 'sel' : ''} ${already ? 'inlist' : ''}`}
                        onClick={() => toggleFilm(f)}>
                        <span className="p" style={{ backgroundImage: f.posterPath ? `url(${f.posterPath})` : 'none' }}>
                          {!already && <span className="cb">{on && <Icon name="check" size={12} />}</span>}
                        </span>
                        <h5>{f.title}</h5>
                        <div className="yr">{f.year || '—'}{already ? ' · already in' : ''}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {pickerOpen ? (
            <>
              <div className="mara-or"><span className="ln" /><span>or build from a source</span><span className="ln" /></div>
              <MarathonSourcePicker
                manualMode="search"
                excludeTmdbIds={inLineup}
                onChange={handlePicked} />
            </>
          ) : (
            <div className="mara-or">
              <span className="ln" />
              <button className="btn text" onClick={() => setPickerOpen(true)}>Not what you wanted? Build from a source</button>
              <span className="ln" />
            </div>
          )}

          <div className="mara-stickybar">
            <div className="cnt">
              <b>{chosen.length} film{chosen.length === 1 ? '' : 's'} selected</b>
              <span className="sub">They’ll be added to the end of the lineup, in the order shown</span>
            </div>
            <button className="btn btn-primary" disabled={chosen.length === 0} onClick={goToDates}>
              Continue to dates <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </>
      )}

      {/* ── DATES ──────────────────────────────────────────────────────── */}
      {phase === 'dates' && (
        <>
          <div className="mara-wiz-head">
            <div className="mara-eyebrow2"><Icon name="calendar-clock" size={13} /> Step 2 of 2 · {marathon?.name}</div>
            <h1>When do these play?</h1>
          </div>

          <div className={`mara-notice ${rhythm ? '' : 'warn'}`}>
            <Icon name={rhythm ? 'repeat' : 'help-circle'} size={16} />
            <div>{rhythm
              ? <>This marathon runs <b>{rhythm.label}</b> — measured from the dates already in it. We’ve carried that on. Change any of them, or clear one to leave it TBD.</>
              : <><b>We can’t work out this marathon’s rhythm yet.</b> It needs at least two dated films to measure the gap between. These are added as TBD — date them from the lineup whenever you like.</>}</div>
          </div>

          {jumpers.length > 0 && (
            <div className="mara-notice warn">
              <Icon name="alert-triangle" size={16} />
              <div>
                <b>{jumpers.map((j) => `“${j.title}”`).join(', ')} {jumpers.length === 1 ? 'is' : 'are'} dated before “{jumpers[0].behind}”, which is still ahead in the lineup.</b>{' '}
                Films post to Discord in lineup order, not date order, so they’ll still go out after it. Drag them up the lineup afterwards if you want them first.
              </div>
            </div>
          )}

          <div className="mara-sectitle">Adding {chosen.length} film{chosen.length === 1 ? '' : 's'}</div>

          {chosen.map((film, i) => (
            <div className="mara-li2" key={film.tmdbId}>
              <span className="num">{items.length + i + 1}</span>
              <div className="poster" style={{ backgroundImage: film.posterPath ? `url(${film.posterPath})` : 'none' }} />
              <div className="t">
                <h4>{film.title}</h4>
                <div className="m">{dates[i]
                  ? (offsetLabel(rhythm, i) || fmtWhen(dates[i]))
                  : 'TBD — date it from the lineup later'}</div>
              </div>
              {dates[i] ? (
                <>
                  <input className="li-date" type="datetime-local" value={dates[i]}
                    onChange={(e) => setDateAt(i, e.target.value)} />
                  <button className="btn ghost sm" onClick={() => setDateAt(i, '')}>Make TBD</button>
                </>
              ) : (
                <>
                  <span className="li-tbd is-tbd">TBD</span>
                  <button className="btn ghost sm" onClick={() =>
                    setDateAt(i, toLocalInput(rhythm ? rhythm.nextDateFor(i, chosen.slice(0, i)) : new Date(Date.now() + 7 * 864e5)))}>
                    Set a date
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="mara-stickybar">
            <div className="cnt">
              <b>Adding {chosen.length} film{chosen.length === 1 ? '' : 's'}</b>
              <span className="sub">{datedCount} dated · {chosen.length - datedCount} TBD · nothing posts to Discord until 3 days before its date</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn ghost" onClick={() => setPhase('pick')}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={confirm}>
                Add to marathon <Icon name="check" size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
