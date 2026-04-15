import { Link, useParams, useNavigate } from 'react-router-dom';
import { getCollections, getCollectionMovies } from '../api/client';
import { useFetch } from '../hooks';
import { Icon, PageHeader, EmptyState } from '../components/ui';
import './CollectionsPage.css';

const CollectionsPage = () => {
  const { name } = useParams();
  const navigate = useNavigate();

  const { data: collections, loading: collectionsLoading, error: collectionsError } = useFetch(
    () => getCollections(),
    [name],
    { enabled: !name, initialData: [] }
  );

  const { data: collectionMovies, loading: moviesLoading, error: moviesError } = useFetch(
    () => getCollectionMovies(name),
    [name],
    { enabled: !!name, initialData: [] }
  );

  const loading = name ? moviesLoading : collectionsLoading;
  const error = name ? moviesError : collectionsError;

  if (loading) return <div className="loading">Loading…</div>;
  if (error)   return <div className="error">Error: {error}</div>;

  /* ── Single collection view ── */
  if (name) {
    return (
      <div className="collections-page">
        <button className="btn text" onClick={() => navigate('/collections')}>
          <Icon name="arrow-left" size={14} /> Back to collections
        </button>

        <PageHeader
          eyebrow="Collection"
          title={decodeURIComponent(name)}
          meta={[`${collectionMovies.length} screening${collectionMovies.length !== 1 ? 's' : ''}`]}
        />

        {collectionMovies.length === 0 ? (
          <EmptyState title="Empty collection." body="No movies in this collection yet." />
        ) : (
          <div className="coll-grid">
            {collectionMovies.map((movie) => (
              <Link key={movie.id} to={`/movie/${movie.id}`} className="coll-card">
                <div className="coll-poster">
                  {movie.image_url ? (
                    <img src={movie.image_url} alt={movie.title} loading="lazy" />
                  ) : (
                    <span className="coll-placeholder">{movie.title?.charAt(0) ?? '?'}</span>
                  )}
                  {movie.avg_rating > 0 && (
                    <span className="coll-rating">{parseFloat(movie.avg_rating).toFixed(1)}</span>
                  )}
                </div>
                <div className="coll-body">
                  <h3 className="coll-title">{movie.title}</h3>
                  <div className="coll-meta">
                    {movie.release_year && <span>{movie.release_year}</span>}
                    {movie.rating_count > 0 && (
                      <>
                        <span className="sep" />
                        <span>{movie.rating_count} vote{movie.rating_count !== 1 ? 's' : ''}</span>
                      </>
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

  /* ── Collections list view ── */
  return (
    <div className="collections-page">
      <PageHeader
        eyebrow="The archive"
        title={<>Movie <em>collections.</em></>}
        meta={[`${collections.length} franchise${collections.length !== 1 ? 's' : ''}`, 'watched together']}
      />

      {collections.length === 0 ? (
        <EmptyState
          icon={<Icon name="folder" size={32} stroke={1.25} />}
          title="No collections yet."
          body="Collections appear automatically once two or more movies from the same franchise are screened."
        />
      ) : (
        <div className="coll-list-grid">
          {collections.map((collection) => (
            <Link
              key={collection.collection_name}
              to={`/collections/${encodeURIComponent(collection.collection_name)}`}
              className="coll-list-card"
            >
              <div className="coll-list-posters">
                {collection.posters?.slice(0, 4).map((poster, i) => (
                  <img key={i} src={poster} alt="" className="coll-list-thumb" loading="lazy" />
                ))}
                {(!collection.posters || collection.posters.length === 0) && (
                  <div className="coll-list-thumb placeholder">
                    <Icon name="folder" size={24} stroke={1.25} />
                  </div>
                )}
              </div>
              <div className="coll-list-body">
                <h3 className="coll-title">{collection.collection_name}</h3>
                <div className="coll-meta">
                  <span>{collection.movie_count} movie{collection.movie_count !== 1 ? 's' : ''}</span>
                  {collection.avg_rating && (
                    <>
                      <span className="sep" />
                      <span className="coll-avg">Avg {parseFloat(collection.avg_rating).toFixed(1)}</span>
                    </>
                  )}
                </div>
              </div>
              <Icon name="arrow-right" size={16} stroke={1.5} className="coll-list-arrow" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;
