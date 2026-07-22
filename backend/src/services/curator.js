const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

export const isCurationAvailable = () => Boolean(GEMINI_API_KEY);

const PROMPT = (vibe) => `You are curating a themed movie marathon.
Return ONLY a JSON array of 6 to 12 real, well-known films matching this request:
"${vibe}"
Each element must be {"title": string, "year": number}. Use the film's original/common English title and its release year. No commentary, no duplicates, no TV shows.`;

// Ask Gemini for titles, then resolve each against TMDB. Unmatched titles are
// dropped. Returns preview items [{tmdbId, title, year, posterPath}].
export const curateLineup = async (vibe) => {
  if (!isCurationAvailable()) { const e = new Error('Curation not configured'); e.status = 503; throw e; }

  const res = await fetch(GEMINI_URL(GEMINI_MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(vibe) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
    })
  });
  if (!res.ok) {
    // Surface Google's actual reason (bad key, model not found, API disabled…).
    const body = await res.text().catch(() => '');
    let reason = body;
    try { reason = JSON.parse(body)?.error?.message || body; } catch { /* keep raw */ }
    console.error(`Gemini API ${res.status} (model ${GEMINI_MODEL}):`, reason);
    const e = new Error(`Gemini ${res.status}: ${String(reason).slice(0, 200)}`);
    e.status = 502;
    throw e;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  let picks;
  try { picks = JSON.parse(text); } catch { picks = []; }
  if (!Array.isArray(picks)) picks = [];

  // Resolve each title→TMDB (search by title, prefer exact year). Drop misses.
  const resolved = await Promise.all(
    picks.slice(0, 12).map(async (p) => {
      if (!p || !p.title) return null;
      try {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(p.title)}&include_adult=false${p.year ? `&primary_release_year=${p.year}` : ''}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const d = await r.json();
        const hit = d.results?.[0];
        if (!hit) return null;
        return {
          tmdbId: hit.id,
          title: hit.title,
          year: hit.release_date ? parseInt(hit.release_date.split('-')[0]) : (p.year || null),
          posterPath: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null
        };
      } catch { return null; }
    })
  );

  // Dedupe by tmdbId, keep order.
  const seen = new Set();
  return resolved.filter((m) => m && !seen.has(m.tmdbId) && seen.add(m.tmdbId));
};
