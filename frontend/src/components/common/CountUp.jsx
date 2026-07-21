import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animates from 0 up to `value` on mount. Honors prefers-reduced-motion by
// rendering the final value immediately. `format` receives the formatted string.
export default function CountUp({ value, duration = 800, decimals = 0, format }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0));
  const rafRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target);
      return undefined;
    }
    let start = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(target * easeOut(progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  const text = decimals > 0 ? display.toFixed(decimals) : String(Math.round(display));
  return <>{format ? format(text) : text}</>;
}
