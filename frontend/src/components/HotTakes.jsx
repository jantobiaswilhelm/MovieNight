import { Link } from 'react-router-dom';
import './HotTakes.css';

const HotTakes = ({ hotTakes }) => {
  if (!hotTakes || hotTakes.length === 0) {
    return (
      <div className="hot-takes">
        <h3>Hot Takes</h3>
        <p className="hot-takes-empty">No hot takes yet - need more ratings with 3+ votes</p>
      </div>
    );
  }

  return (
    <div className="hot-takes">
      <h3>Hot Takes</h3>
      <p className="hot-takes-subtitle">Movies where you differ most from the average</p>
      <div className="hot-takes-list">
        {hotTakes.map((take) => {
          const diff = parseFloat(take.difference);
          const isHigher = diff > 0;

          return (
            <Link
              key={take.movie_night_id}
              to={`/movie/${take.movie_night_id}`}
              className="hot-take-item"
            >
              <div className="hot-take-poster">
                {take.image_url ? (
                  <img src={take.image_url} alt={take.title} />
                ) : (
                  <div className="no-poster">?</div>
                )}
              </div>
              <div className="hot-take-info">
                <span className="hot-take-title">{take.title}</span>
                <div className="hot-take-scores">
                  <span className="hot-take-your-score">
                    You: {parseFloat(take.user_score).toFixed(1)}
                  </span>
                  <span className="hot-take-avg-score">
                    Avg: {parseFloat(take.avg_score).toFixed(1)}
                  </span>
                </div>
              </div>
              <div className={`hot-take-diff ${isHigher ? 'higher' : 'lower'}`}>
                <span className="diff-arrow">{isHigher ? '▲' : '▼'}</span>
                <span className="diff-value">{Math.abs(diff).toFixed(1)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default HotTakes;
