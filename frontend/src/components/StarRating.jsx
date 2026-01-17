import './StarRating.css';

const StarRating = ({ rating, maxRating = 10, size = 'medium', showValue = true }) => {
  // Convert 1-10 scale to 5 stars
  const starCount = 5;
  const normalizedRating = (rating / maxRating) * starCount;
  const fullStars = Math.floor(normalizedRating);
  const partialFill = (normalizedRating - fullStars) * 100;
  const emptyStars = starCount - fullStars - (partialFill > 0 ? 1 : 0);

  return (
    <div className={`star-rating star-rating--${size}`}>
      <div className="stars">
        {/* Full stars */}
        {[...Array(fullStars)].map((_, i) => (
          <span key={`full-${i}`} className="star star--full">★</span>
        ))}

        {/* Partial star */}
        {partialFill > 0 && (
          <span className="star star--partial">
            <span className="star-bg">★</span>
            <span className="star-fill" style={{ width: `${partialFill}%` }}>★</span>
          </span>
        )}

        {/* Empty stars */}
        {[...Array(emptyStars)].map((_, i) => (
          <span key={`empty-${i}`} className="star star--empty">★</span>
        ))}
      </div>

      {showValue && rating > 0 && (
        <span className="star-value">{rating.toFixed(1)}</span>
      )}
    </div>
  );
};

export default StarRating;
