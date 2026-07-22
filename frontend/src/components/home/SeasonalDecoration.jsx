const PARTICLE_COUNT = 24;
const PARTICLE_THEMES = ['halloween', 'christmas', 'newyear'];

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SeasonalDecoration({ theme }) {
  if (!theme || !PARTICLE_THEMES.includes(theme) || reducedMotion()) return null;

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => (
    <span
      key={i}
      className={`season-particle season-particle--${theme}`}
      style={{
        left: `${(i * 97) % 100}%`,
        animationDelay: `${(i % 8) * 0.7}s`,
        animationDuration: `${6 + (i % 5)}s`,
      }}
      aria-hidden="true"
    />
  ));

  return <div className="seasonal-decoration" aria-hidden="true">{particles}</div>;
}
