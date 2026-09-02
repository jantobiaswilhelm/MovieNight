import { useEffect, useState } from 'react';
import { Stat } from '../ui';
import { CountUp } from '../common';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FAKE = { movies: '∞', hours: '999,999', rating: '11.0' };

export default function HomeStatsBand({ stats, seasonalKey = null }) {
  const prank = seasonalKey === 'aprilfools' && !reducedMotion();
  const [revealed, setRevealed] = useState(!prank);

  useEffect(() => {
    if (!prank) { setRevealed(true); return undefined; }
    const t = setTimeout(() => setRevealed(true), 1400);
    return () => clearTimeout(t);
  }, [prank]);

  if (!stats) return null;

  const hours = Math.round((stats.total_runtime || 0) / 60);
  const avg = Number(stats.overall_avg_rating) || 0;

  return (
    <section className="home-stats-band" aria-label="Club statistics">
      <Stat
        label="Movies watched"
        value={revealed ? <CountUp value={stats.total_movies} /> : FAKE.movies}
      />
      <Stat
        label="Hours watched"
        value={revealed ? <CountUp value={hours} /> : FAKE.hours}
      />
      {/* Counts may count; a 1–10 average may not. Ticking it up from zero
          reads as broken data ("0.3/10") for the length of the animation. */}
      <Stat
        label="Average rating"
        value={revealed ? avg.toFixed(1) : FAKE.rating}
        unit={revealed ? '/10' : '/11'}
      />
    </section>
  );
}
