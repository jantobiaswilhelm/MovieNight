import { useState, useEffect } from 'react';
import { getAvatarUrl, formatRelativeTime } from '../../utils/helpers';
import { Icon } from '../ui';

const ROTATE_MS = 6000;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  return (
    <div
      className="reviews-feature"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
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
