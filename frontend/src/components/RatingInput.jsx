import { useState } from 'react';
import './RatingInput.css';

const RatingInput = ({ currentRating, onSubmit, disabled }) => {
  const [score, setScore] = useState(currentRating ? parseFloat(currentRating) : 7);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(score);
    } finally {
      setSubmitting(false);
    }
  };

  const scores = [];
  for (let i = 1; i <= 10; i += 0.5) {
    scores.push(i);
  }

  return (
    <div className="rating-input">
      <div className="rating-selector">
        <label htmlFor="rating">Your Rating:</label>
        <select
          id="rating"
          value={score}
          onChange={(e) => setScore(parseFloat(e.target.value))}
          disabled={disabled || submitting}
        >
          {scores.map((s) => (
            <option key={s} value={s}>
              {s.toFixed(1)}
            </option>
          ))}
        </select>
        <span className="rating-display">{score.toFixed(1)}/10</span>
      </div>

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={disabled || submitting}
      >
        {submitting ? 'Saving...' : currentRating ? 'Update Rating' : 'Submit Rating'}
      </button>
    </div>
  );
};

export default RatingInput;
