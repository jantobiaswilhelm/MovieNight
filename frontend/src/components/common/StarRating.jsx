import { memo } from 'react';
import './StarRating.css';

const STAR_PATH = 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
const SIZE_PX = { small: 12, medium: 16, large: 22 };

const StarRating = memo(({ rating, maxRating = 10, size = 'medium', showValue = true }) => {
  const starCount = 5;
  const normalized = Math.max(0, Math.min(starCount, (rating / maxRating) * starCount));
  const px = SIZE_PX[size] ?? SIZE_PX.medium;

  return (
    <div
      className={`star-rating star-rating--${size}`}
      role="img"
      aria-label={`${rating?.toFixed ? rating.toFixed(1) : rating} out of ${maxRating}`}
    >
      <div className="stars">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, normalized - i));
          const pct = fill * 100;
          return (
            <span key={i} className="star" style={{ width: px, height: px }}>
              <svg className="star-bg" viewBox="0 0 24 24" width={px} height={px} aria-hidden="true">
                <path d={STAR_PATH} />
              </svg>
              {pct > 0 && (
                <span className="star-fill" style={{ width: `${pct}%` }}>
                  <svg viewBox="0 0 24 24" width={px} height={px} aria-hidden="true">
                    <path d={STAR_PATH} />
                  </svg>
                </span>
              )}
            </span>
          );
        })}
      </div>

      {showValue && rating > 0 && (
        <span className="star-value">{rating.toFixed(1)}</span>
      )}
    </div>
  );
});

export default StarRating;
