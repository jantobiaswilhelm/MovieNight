import { Link } from 'react-router-dom';
import './TopRatedMovies.css';

const TopRatedMovies = ({ movies }) => {
  if (!movies || movies.length === 0) {
    return (
      <div className="top-rated-movies">
        <h3>Top 10 Movies</h3>
        <p className="top-rated-empty">No ratings yet - rate some movies to see your top 10!</p>
      </div>
    );
  }

  const getMedal = (index) => {
    const medals = ['gold', 'silver', 'bronze'];
    return medals[index] || null;
  };

  return (
    <div className="top-rated-movies">
      <h3>Top 10 Movies</h3>
      <p className="top-rated-subtitle">Your highest rated movies</p>
      <div className="top-rated-list">
        {movies.map((movie, index) => (
          <Link
            key={movie.movie_night_id}
            to={`/movie/${movie.movie_night_id}`}
            className={`top-rated-item ${getMedal(index) || ''}`}
          >
            <div className={`top-rated-rank ${getMedal(index) || ''}`}>
              {index + 1}
            </div>
            <div className="top-rated-poster">
              {movie.image_url ? (
                <img src={movie.image_url} alt={movie.title} />
              ) : (
                <div className="no-poster">?</div>
              )}
            </div>
            <div className="top-rated-info">
              <span className="top-rated-title">{movie.title}</span>
              <div className="top-rated-scores">
                <span className="top-rated-your-score">
                  {parseFloat(movie.score).toFixed(1)}/10
                </span>
                {movie.community_avg && (
                  <span className="top-rated-avg-score">
                    Avg: {parseFloat(movie.community_avg).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default TopRatedMovies;
