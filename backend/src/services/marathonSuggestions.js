// Works out what a marathon is *about* from the films already in it, then
// proposes more in the same vein.
//
// Detection is deliberately structural — shared collection, shared director,
// shared cast, genre+decade — rather than AI. It is deterministic, explainable
// in one sentence to the user, and behaves identically on deploys with no
// GEMINI_API_KEY (curation is optional; see services/curator.js). When nothing
// confident turns up the UI falls back to the wizard's source picker.
//
// Note on genre+decade: it can *name* a theme but cannot source picks. We have
// search / person / collection / recommendations / credits and no TMDB discover
// endpoint, so pooled recommendations are the generic row instead.

import * as tmdb from './tmdb.js';

// Bound the TMDB fan-out: each sampled film costs 3 requests (basics, credits,
// recommendations). 8 films = 24 parallel requests, which is the ceiling we're
// willing to spend on one page load.
const SAMPLE_LIMIT = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ROW = 12;

const cache = new Map();   // key → { at, payload }

// Spread the sample across the lineup rather than taking the first N, so a long
// marathon whose theme drifts is still represented at both ends.
const sampleItems = (items) => {
  const withTmdb = items.filter((it) => it.tmdb_id);
  if (withTmdb.length <= SAMPLE_LIMIT) return withTmdb;
  const step = withTmdb.length / SAMPLE_LIMIT;
  return Array.from({ length: SAMPLE_LIMIT }, (_, i) => withTmdb[Math.floor(i * step)]);
};

// Count how often each id appears, carrying a display name along.
const tally = (entries) => {
  const counts = new Map();
  for (const { id, name } of entries) {
    const row = counts.get(id) || { id, name, count: 0 };
    row.count += 1;
    counts.set(id, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
};

const decadeOf = (year) => (year ? `${Math.floor(year / 10) * 10}s` : null);

// TMDB credits and recommendations happily include announced-but-unreleased
// films — a Sigourney Weaver row otherwise leads with Avatar 5. You can't
// schedule a movie night for a film that doesn't exist yet.
const released = (film) => !film.releaseDate || new Date(film.releaseDate) <= new Date();

// TMDB collection names already end in "Collection" ("The Alien Collection"),
// so strip it before we wrap the name in our own wording.
const collectionBase = (name) => (name || '').replace(/\s+collection$/i, '').trim() || name;

// Dominant genre + decade, used only to label a lineup we can't pin on a person
// or a franchise. genres is a comma-joined string on marathon_items.
const describeByGenre = (items) => {
  const genreCounts = new Map();
  for (const it of items) {
    for (const g of (it.genres || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
  }
  const top = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  if (top.length === 0) return null;

  const decades = items.map((it) => decadeOf(it.release_year)).filter(Boolean);
  const decadeCounts = new Map();
  for (const d of decades) decadeCounts.set(d, (decadeCounts.get(d) || 0) + 1);
  const [topDecade, topDecadeCount] = [...decadeCounts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  // Only claim a decade when most of the lineup actually sits in it.
  const decadePrefix = topDecade && topDecadeCount >= items.length / 2 ? `${topDecade} ` : '';
  return `${decadePrefix}${top.join(' / ').toLowerCase()} films`;
};

export const buildSuggestions = async (marathon, items) => {
  const key = `${marathon.id}:${items.map((i) => i.id).join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;

  const inLineup = new Set(items.map((it) => it.tmdb_id).filter(Boolean));
  const sample = sampleItems(items);

  if (sample.length === 0) {
    return { theme: null, rows: [], sampled: 0, lineupSize: items.length };
  }

  // One fan-out pass: films run in parallel, the three lookups per film run in
  // sequence. That caps us at 8 concurrent TMDB requests rather than 24, which
  // keeps us well clear of their rate limit at the cost of two extra hops.
  // A film that fails any lookup contributes nothing rather than failing the
  // whole page — a single dead TMDB id shouldn't blank the UI.
  const probes = await Promise.all(sample.map(async (it) => ({
    item: it,
    basics: await tmdb.getMovieBasics(it.tmdb_id).catch(() => null),
    credits: await tmdb.getMovieCredits(it.tmdb_id).catch(() => null),
    recs: await tmdb.getRecommendations(it.tmdb_id).catch(() => [])
  })));

  // ── signal 1: a shared collection ────────────────────────────────────────
  const collections = tally(
    probes
      .filter((p) => p.basics?.collectionId)
      .map((p) => ({ id: p.basics.collectionId, name: p.basics.collectionName }))
  );
  const topCollection = collections[0] || null;

  // ── signal 2/3: a shared director, then a shared cast member ─────────────
  const directors = tally(probes.flatMap((p) => (p.credits?.directors || []).map((d) => ({ id: d.id, name: d.name }))));
  const castMembers = tally(probes.flatMap((p) => (p.credits?.cast || []).map((c) => ({ id: c.id, name: c.name }))));
  // With a one-film lineup any credit is "shared"; past that, insist on a repeat.
  const minShared = sample.length === 1 ? 1 : 2;
  const topDirector = directors.find((d) => d.count >= minShared) || null;
  const topCast = castMembers.find((c) => c.count >= minShared) || null;

  const rows = [];

  // Rest of the franchise.
  if (topCollection && topCollection.count >= minShared) {
    const { name, parts } = await tmdb.getCollectionById(topCollection.id).catch(() => ({ name: null, parts: [] }));
    const missing = parts.filter((p) => !inLineup.has(p.tmdbId) && released(p));
    if (missing.length > 0) {
      rows.push({
        key: 'collection',
        title: `Rest of the ${collectionBase(name || topCollection.name)} collection`,
        note: `${missing.length} not in the lineup`,
        films: missing.slice(0, MAX_ROW)
      });
    }
  }

  // More by the recurring director, then the recurring face.
  const person = topDirector
    ? { ...topDirector, role: 'directing', label: `More by ${topDirector.name}` }
    : topCast
      ? { ...topCast, role: 'acting', label: `More with ${topCast.name}` }
      : null;
  if (person) {
    const films = await tmdb.getPersonMovies(person.id, person.role).catch(() => []);
    const missing = films.filter((f) => !inLineup.has(f.tmdbId) && released(f));
    if (missing.length > 0) {
      rows.push({
        key: 'person',
        title: person.label,
        note: `${missing.length} not in the lineup`,
        films: missing.slice(0, MAX_ROW)
      });
    }
  }

  // Pooled recommendations — ranked by how many lineup films recommended them,
  // so a title the whole marathon points at outranks a one-off.
  const pool = new Map();
  for (const p of probes) {
    for (const rec of p.recs) {
      if (inLineup.has(rec.tmdbId) || !released(rec)) continue;
      const row = pool.get(rec.tmdbId) || { ...rec, hits: 0 };
      row.hits += 1;
      pool.set(rec.tmdbId, row);
    }
  }
  // Don't repeat anything already offered above.
  const offered = new Set(rows.flatMap((r) => r.films.map((f) => f.tmdbId)));
  const pooled = [...pool.values()]
    .filter((f) => !offered.has(f.tmdbId))
    .sort((a, b) => b.hits - a.hits || b.popularity - a.popularity)
    .slice(0, MAX_ROW);
  if (pooled.length > 0) {
    const recurring = pooled.filter((f) => f.hits > 1).length;
    rows.push({
      key: 'similar',
      title: 'Similar to this lineup',
      note: recurring > 0 ? `${recurring} recur across several films` : 'based on TMDB recommendations',
      films: pooled.map(({ hits, popularity, ...f }) => f)
    });
  }

  // ── the headline ─────────────────────────────────────────────────────────
  // Strongest confident signal wins. Genre only ever labels — it has no row.
  let theme = null;
  const half = Math.ceil(sample.length / 2);
  if (topCollection && topCollection.count >= half && topCollection.count >= minShared) {
    theme = {
      kind: 'collection',
      label: `The ${collectionBase(topCollection.name)} franchise`,
      evidence: `${topCollection.count} of ${sample.length} films belong to it · from TMDB`
    };
  } else if (topDirector) {
    theme = {
      kind: 'director',
      label: `Films directed by ${topDirector.name}`,
      evidence: `${topDirector.count} of ${sample.length} films share this director · from TMDB credits`
    };
  } else if (topCast) {
    theme = {
      kind: 'cast',
      label: `Films starring ${topCast.name}`,
      evidence: `${topCast.count} of ${sample.length} films share this face · from TMDB credits`
    };
  } else {
    const described = describeByGenre(items);
    if (described) {
      theme = { kind: 'genre', label: described, evidence: 'from the genres and years already in the lineup' };
    }
  }

  const payload = { theme, rows, sampled: sample.length, lineupSize: items.length };
  cache.set(key, { at: Date.now(), payload });
  return payload;
};

// Drop cached suggestions for a marathon once its lineup changes.
export const invalidateSuggestions = (marathonId) => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${marathonId}:`)) cache.delete(key);
  }
};
