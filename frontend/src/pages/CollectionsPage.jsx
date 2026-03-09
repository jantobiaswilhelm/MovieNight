import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getCollections, getCollectionMovies } from '../api/client';
import './CollectionsPage.css';

const CollectionsPage = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [collectionMovies, setCollectionMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (name) {
      fetchCollectionMovies();
    } else {
      fetchCollections();
    }
  }, [name]);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const data = await getCollections();
      setCollections(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectionMovies = async () => {
    setLoading(true);
    try {
      const data = await getCollectionMovies(name);
      setCollectionMovies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Single collection view
  if (name) {
    return (
      <div className="collections-page">
        <button className="back-link" onClick={() => navigate('/collections')}>
          &larr; Back to Collections
        </button>

        <h1>{decodeURIComponent(name)}</h1>
        <p className="collection-subtitle">{collectionMovies.length} movies watched</p>

        {collectionMovies.length === 0 ? (
          <div className="empty-state">No movies found in this collection.</div>
        ) : (
          <div className="collection-movies-grid">
            {collectionMovies.map((movie) => (
              <Link key={movie.id} to={`/movie/${movie.id}`} className="collection-movie-card">
                {movie.image_url ? (
                  <img src={movie.image_url} alt={movie.title} className="collection-movie-poster" loading="lazy" />
                ) : (
                  <div className="collection-movie-no-poster">No Image</div>
                )}
                <div className="collection-movie-info">
                  <h3>{movie.title}</h3>
                  <div className="collection-movie-meta">
                    {movie.release_year && <span>{movie.release_year}</span>}
                    {movie.avg_rating > 0 && (
                      <span className="collection-movie-rating">
                        {parseFloat(movie.avg_rating).toFixed(1)} ({movie.rating_count})
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Collections list view
  return (
    <div className="collections-page">
      <h1>Movie Collections</h1>
      <p className="page-subtitle">Franchises and series we've watched together</p>

      {collections.length === 0 ? (
        <div className="empty-state">
          <p>No movie collections yet.</p>
          <p>Collections will appear once movies from the same franchise are watched.</p>
        </div>
      ) : (
        <div className="collections-grid">
          {collections.map((collection) => (
            <Link
              key={collection.collection_name}
              to={`/collections/${encodeURIComponent(collection.collection_name)}`}
              className="collection-card"
            >
              <div className="collection-posters">
                {collection.posters?.slice(0, 4).map((poster, i) => (
                  <img key={i} src={poster} alt={collection.name} className="collection-poster-thumb" loading="lazy" />
                ))}
                {(!collection.posters || collection.posters.length === 0) && (
                  <div className="collection-no-poster">No Images</div>
                )}
              </div>
              <div className="collection-info">
                <h3>{collection.collection_name}</h3>
                <div className="collection-meta">
                  <span>{collection.movie_count} movies</span>
                  {collection.avg_rating && (
                    <span className="collection-rating">
                      Avg: {parseFloat(collection.avg_rating).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;
