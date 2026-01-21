import { useState } from 'react';
import './GenreBreakdown.css';

const GenreBreakdown = ({ genreStats }) => {
  const [expanded, setExpanded] = useState(false);

  if (!genreStats || genreStats.length === 0) {
    return (
      <div className="genre-breakdown">
        <h3>Genre Breakdown</h3>
        <p className="genre-empty">No genre data available</p>
      </div>
    );
  }

  const favorites = genreStats.slice(0, 3);
  const leastFavorites = genreStats.slice(-3).reverse();
  const allGenres = expanded ? genreStats : null;

  return (
    <div className="genre-breakdown">
      <h3>Genre Breakdown</h3>

      <div className="genre-sections">
        <div className="genre-section">
          <h4 className="genre-section-title favorites">Favorites</h4>
          <div className="genre-list">
            {favorites.map((genre, index) => (
              <div key={genre.genre} className="genre-item favorite">
                <span className="genre-rank">{index + 1}</span>
                <span className="genre-name">{genre.genre}</span>
                <span className="genre-stats">
                  <span className="genre-avg">{parseFloat(genre.avg_rating).toFixed(1)}</span>
                  <span className="genre-count">({genre.count})</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {leastFavorites.length > 0 && genreStats.length > 3 && (
          <div className="genre-section">
            <h4 className="genre-section-title least-favorites">Least Favorites</h4>
            <div className="genre-list">
              {leastFavorites.map((genre, index) => (
                <div key={genre.genre} className="genre-item least-favorite">
                  <span className="genre-rank">{genreStats.length - 2 + index}</span>
                  <span className="genre-name">{genre.genre}</span>
                  <span className="genre-stats">
                    <span className="genre-avg">{parseFloat(genre.avg_rating).toFixed(1)}</span>
                    <span className="genre-count">({genre.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {genreStats.length > 6 && (
        <>
          <button
            className="genre-expand-btn"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show Less' : `Show All ${genreStats.length} Genres`}
          </button>

          {expanded && (
            <div className="genre-full-list">
              {allGenres.map((genre, index) => (
                <div key={genre.genre} className="genre-item-full">
                  <span className="genre-rank-full">{index + 1}</span>
                  <span className="genre-name">{genre.genre}</span>
                  <div className="genre-bar-container">
                    <div
                      className="genre-bar"
                      style={{ width: `${(parseFloat(genre.avg_rating) / 10) * 100}%` }}
                    />
                  </div>
                  <span className="genre-stats">
                    <span className="genre-avg">{parseFloat(genre.avg_rating).toFixed(1)}</span>
                    <span className="genre-count">({genre.count})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GenreBreakdown;
