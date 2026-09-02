import { useState, useEffect, useRef } from 'react';
import { getAvatarUrl, formatRelativeTime } from '../../utils/helpers';
import { sanitizeImageUrl } from '../../utils/sanitizeUrl';
import { Icon } from '../ui';

const ROTATE_MS = 6000;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Two stacked layers that crossfade, so a rotation never leaves the panel empty.
// The incoming image is decoded off-screen first and only then swapped to the
// front — a single keyed element would unmount, refetch, and blank the stage.
function Backdrop({ src }) {
  const [layers, setLayers] = useState([src || null, null]);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const shownRef = useRef(src || null);

  useEffect(() => {
    if (!src || src === shownRef.current) return undefined;

    let cancelled = false;
    const swap = () => {
      if (cancelled) return;
      const back = 1 - frontRef.current;
      shownRef.current = src;
      frontRef.current = back;
      setLayers((prev) => {
        const next = [...prev];
        next[back] = src;
        return next;
      });
      setFront(back);
    };

    const img = new Image();
    img.onload = swap;
    img.onerror = swap;
    img.src = src;

    return () => { cancelled = true; };
  }, [src]);

  return (
    <div className="rf-bgs" aria-hidden="true">
      {layers.map((layer, i) => (
        <div
          key={i}
          className={`rf-bg ${layer && i === front ? 'is-visible' : ''}`.trim()}
          style={layer ? { backgroundImage: `url(${layer})` } : undefined}
        />
      ))}
    </div>
  );
}

// Magazine-style featured review: one quote at a time, auto-rotating
// (pauses on hover, disabled under reduced-motion), with arrows + dots to browse.
export default function ReviewsFeature({ reviews }) {
  const count = reviews.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Keep the index in range if the review list shrinks.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (paused || count <= 1 || reducedMotion()) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;

  const review = reviews[index % count];
  const go = (n) => setIndex((n + count) % count);
  const backdrop = sanitizeImageUrl(review.backdrop_url) || sanitizeImageUrl(review.image_url);

  return (
    <div
      className="reviews-feature"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Backdrop src={backdrop} />
      <div className="rf-stage">
        {count > 1 && (
          <button className="rf-nav" onClick={() => go(index - 1)} aria-label="Previous review">
            <Icon name="chevron-left" size={18} stroke={1.5} />
          </button>
        )}

        <article className="rf-card" key={index}>
          <blockquote className="rf-quote">
            <span className="rf-mark" aria-hidden="true">&ldquo;</span>
            {review.comment}
            <span className="rf-mark" aria-hidden="true">&rdquo;</span>
          </blockquote>

          <div className="rf-meta">
            <span className="rf-score">
              <span className="rf-score-num">{parseFloat(review.score).toFixed(1)}</span>
              <span className="rf-score-denom">/ 10</span>
            </span>
            <span className="rf-dot-sep" aria-hidden="true" />
            <span className="rf-movie">{review.movie_title}</span>
          </div>

          <div className="rf-who">
            <img
              src={getAvatarUrl(review.discord_id, review.avatar)}
              alt={review.username}
              className="rf-avatar"
              loading="lazy"
            />
            <span className="rf-name">{review.username}</span>
            {review.created_at && (
              <span className="rf-time">{formatRelativeTime(review.created_at)}</span>
            )}
          </div>
        </article>

        {count > 1 && (
          <button className="rf-nav" onClick={() => go(index + 1)} aria-label="Next review">
            <Icon name="chevron-right" size={18} stroke={1.5} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="rf-dots" role="tablist" aria-label="Reviews">
          {reviews.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              className={`rf-dot ${i === index ? 'active' : ''}`}
              onClick={() => go(i)}
              aria-selected={i === index}
              aria-label={`Review ${i + 1} of ${count}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
