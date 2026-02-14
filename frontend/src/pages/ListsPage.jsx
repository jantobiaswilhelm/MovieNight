import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMyLists,
  getPublicLists,
  createList,
  getList,
  deleteList,
  removeListItem,
  searchTMDB,
  addListItem
} from '../api/client';
import './ListsPage.css';

const ListsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [myLists, setMyLists] = useState([]);
  const [publicLists, setPublicLists] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMovieModal, setShowAddMovieModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListPublic, setNewListPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (id) {
      fetchList();
    } else {
      fetchLists();
    }
  }, [id, isAuthenticated]);

  const fetchLists = async () => {
    setLoading(true);
    try {
      const [myData, publicData] = await Promise.all([
        isAuthenticated ? getMyLists() : [],
        getPublicLists()
      ]);
      setMyLists(myData);
      setPublicLists(publicData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await getList(id);
      setCurrentList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    setCreating(true);
    try {
      const newList = await createList(newListName, newListDescription, newListPublic);
      setShowCreateModal(false);
      setNewListName('');
      setNewListDescription('');
      navigate(`/lists/${newList.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async () => {
    if (!confirm('Are you sure you want to delete this list?')) return;

    try {
      await deleteList(currentList.id);
      navigate('/lists');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await removeListItem(currentList.id, itemId);
      setCurrentList((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== itemId)
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const results = await searchTMDB(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMovie = async (movie) => {
    try {
      await addListItem(currentList.id, {
        tmdb_id: movie.id,
        title: movie.title,
        image_url: movie.posterPath,
        release_year: movie.year
      });
      setShowAddMovieModal(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchList();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Single list view
  if (id && currentList) {
    return (
      <div className="lists-page">
        <button className="back-link" onClick={() => navigate('/lists')}>
          &larr; Back to Lists
        </button>

        <div className="list-header">
          <div>
            <h1>{currentList.name}</h1>
            {currentList.description && (
              <p className="list-description">{currentList.description}</p>
            )}
            <div className="list-meta">
              <span>by {currentList.username}</span>
              <span>{currentList.items?.length || 0} movies</span>
              <span className={`list-visibility ${currentList.is_public ? 'public' : 'private'}`}>
                {currentList.is_public ? 'Public' : 'Private'}
              </span>
            </div>
          </div>
          {currentList.is_owner && (
            <div className="list-actions">
              <button className="btn-primary" onClick={() => setShowAddMovieModal(true)}>
                + Add Movie
              </button>
              <button className="btn-danger" onClick={handleDeleteList}>
                Delete List
              </button>
            </div>
          )}
        </div>

        {currentList.items?.length === 0 ? (
          <div className="empty-state">
            <p>This list is empty.</p>
            {currentList.is_owner && <p>Add some movies to get started!</p>}
          </div>
        ) : (
          <div className="list-items">
            {currentList.items?.map((item) => (
              <div key={item.id} className="list-item">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="list-item-poster" />
                ) : (
                  <div className="list-item-no-poster">No Image</div>
                )}
                <div className="list-item-info">
                  <h3>{item.title}</h3>
                  {item.release_year && <span className="list-item-year">{item.release_year}</span>}
                  {item.note && <p className="list-item-note">{item.note}</p>}
                </div>
                {currentList.is_owner && (
                  <button
                    className="list-item-remove"
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Movie Modal */}
        {showAddMovieModal && (
          <div className="modal-overlay" onClick={() => setShowAddMovieModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Movie to List</h2>
                <button className="modal-close" onClick={() => setShowAddMovieModal(false)}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="search-input-group">
                  <input
                    type="text"
                    placeholder="Search for a movie..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button onClick={handleSearch} disabled={searching}>
                    {searching ? '...' : 'Search'}
                  </button>
                </div>
                <div className="search-results">
                  {searchResults.map((movie) => (
                    <div
                      key={movie.id}
                      className="search-result-item"
                      onClick={() => handleAddMovie(movie)}
                    >
                      {movie.posterPath ? (
                        <img src={movie.posterPath} alt={movie.title} />
                      ) : (
                        <div className="no-poster-small">?</div>
                      )}
                      <div className="search-result-info">
                        <span className="search-result-title">{movie.title}</span>
                        {movie.year && <span className="search-result-year">{movie.year}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Lists overview
  return (
    <div className="lists-page">
      <div className="lists-header">
        <h1>Movie Lists</h1>
        {isAuthenticated && (
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create List
          </button>
        )}
      </div>

      {/* My Lists */}
      {isAuthenticated && myLists.length > 0 && (
        <section className="lists-section">
          <h2>My Lists</h2>
          <div className="lists-grid">
            {myLists.map((list) => (
              <Link key={list.id} to={`/lists/${list.id}`} className="list-card">
                <h3>{list.name}</h3>
                {list.description && <p className="list-card-desc">{list.description}</p>}
                <div className="list-card-meta">
                  <span>{list.item_count} movies</span>
                  <span className={`list-visibility ${list.is_public ? 'public' : 'private'}`}>
                    {list.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Public Lists */}
      <section className="lists-section">
        <h2>Public Lists</h2>
        {publicLists.length === 0 ? (
          <div className="empty-state">
            <p>No public lists yet.</p>
            {isAuthenticated && <p>Create the first one!</p>}
          </div>
        ) : (
          <div className="lists-grid">
            {publicLists.map((list) => (
              <Link key={list.id} to={`/lists/${list.id}`} className="list-card">
                <h3>{list.name}</h3>
                {list.description && <p className="list-card-desc">{list.description}</p>}
                <div className="list-card-meta">
                  <span>by {list.username}</span>
                  <span>{list.item_count} movies</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New List</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateList}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="My Favorite Movies"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description (optional)</label>
                  <textarea
                    value={newListDescription}
                    onChange={(e) => setNewListDescription(e.target.value)}
                    placeholder="A collection of..."
                    rows={3}
                  />
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newListPublic}
                      onChange={(e) => setNewListPublic(e.target.checked)}
                    />
                    Make this list public
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListsPage;
