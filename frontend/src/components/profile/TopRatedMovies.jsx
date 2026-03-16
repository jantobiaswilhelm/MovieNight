import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TopRatedMovies.css';

const TopRatedMovies = memo(({ movies }) => {
  const [expanded, setExpanded] = useState(false);

  if (!movies || movies.length === 0) {
    return (
      <div className="top-rated-movies">
        <h3>Top Rated on Server</h3>
        <p className="top-rated-empty">No ratings yet - rate some movies to see your top 10!</p>
      </div>
    );
  }

  const visibleMovies = expanded ? movies : movies.slice(0, 5);

  return (
    <div className="top-rated-movies">
      <div className="top-rated-header">
        <h3>Top Rated on Server</h3>
        {movies.length > 5 && (
          <button
            className="top-rated-toggle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show Less' : `Show All ${movies.length}`}
          </button>
        )}
      </div>
      <div className={`top-rated-grid ${expanded ? 'expanded' : ''}`}>
        {visibleMovies.map((movie, index) => (
          <Link
            key={movie.movie_night_id}
            to={`/movie/${movie.movie_night_id}`}
            className="top-rated-slot"
          >
            <div className="top-rated-poster">
              {movie.image_url ? (
                <img src={movie.image_url} alt={movie.title} loading="lazy" />
              ) : (
                <div className="no-poster">?</div>
              )}
            </div>
            <div className={`top-rated-rank-badge ${index < 3 ? ['gold', 'silver', 'bronze'][index] : ''}`}>
              {index + 1}
            </div>
            <div className="top-rated-score-badge">
              {parseFloat(movie.score).toFixed(1)}
            </div>
            <div className="top-rated-overlay">
              <span className="top-rated-title">{movie.title}</span>
              {movie.community_avg && (
                <span className="top-rated-avg">Avg: {parseFloat(movie.community_avg).toFixed(1)}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});

export default TopRatedMovies;
