import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import {
  getMyLists, getPublicLists, createList, getList, deleteList,
  removeListItem, searchTMDB, addListItem
} from '../api/client';
import { Icon, PageHeader, SectionHead, EmptyState, Chip } from '../components/ui';
import './ListsPage.css';

const ListsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const confirm = useConfirm();
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
    if (id) fetchList();
    else fetchLists();
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
    if (!(await confirm({ title: 'Delete list?', message: 'Are you sure you want to delete this list?', confirmLabel: 'Delete', danger: true }))) return;
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

  if (loading) return <div className="loading">Loading…</div>;
  if (error)   return <div className="error">Error: {error}</div>;

  /* ── Single list view ── */
  if (id && currentList) {
    return (
      <div className="lists-page">
        <button className="btn text" onClick={() => navigate('/lists')}>
          <Icon name="arrow-left" size={14} /> Back to lists
        </button>

        <PageHeader
          eyebrow={currentList.is_public ? 'Public list' : 'Private list'}
          title={currentList.name}
          meta={[
            `by ${currentList.username}`,
            `${currentList.items?.length || 0} title${(currentList.items?.length || 0) !== 1 ? 's' : ''}`,
          ]}
          actions={currentList.is_owner && (
            <>
              <button className="btn" onClick={() => setShowAddMovieModal(true)}>
                <Icon name="plus" size={14} /> <span>Add movie</span>
              </button>
              <button className="btn destructive" onClick={handleDeleteList}>
                <Icon name="trash" size={14} /> <span>Delete</span>
              </button>
            </>
          )}
        />

        {currentList.description && (
          <p className="ls-description">{currentList.description}</p>
        )}

        {currentList.items?.length === 0 ? (
          <EmptyState
            icon={<Icon name="list" size={32} stroke={1.25} />}
            title="This list is empty."
            body={currentList.is_owner ? 'Search for a movie and add it to the list.' : 'Nothing here yet.'}
            action={currentList.is_owner && (
              <button className="btn" onClick={() => setShowAddMovieModal(true)}>Add first movie</button>
            )}
          />
        ) : (
          <ul className="ls-items">
            {currentList.items?.map((item, idx) => (
              <li key={item.id} className="ls-item">
                <span className="ls-item-rank">{String(idx + 1).padStart(2, '0')}</span>
                <div className="ls-item-poster">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} loading="lazy" />
                  ) : (
                    <span className="ls-placeholder">{item.title?.charAt(0) ?? '?'}</span>
                  )}
                </div>
                <div className="ls-item-body">
                  <h3 className="ls-item-title">{item.title}</h3>
                  <div className="ls-item-meta">
                    {item.release_year && <span>{item.release_year}</span>}
                  </div>
                  {item.note && <p className="ls-item-note">&ldquo;{item.note}&rdquo;</p>}
                </div>
                {currentList.is_owner && (
                  <button
                    className="ls-item-remove"
                    onClick={() => handleRemoveItem(item.id)}
                    aria-label={`Remove ${item.title}`}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add movie modal */}
        {showAddMovieModal && (
          <div className="ls-modal-overlay" onClick={() => setShowAddMovieModal(false)}>
            <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
              <header className="ls-modal-head">
                <div>
                  <div className="ls-modal-eyebrow">Add to list</div>
                  <h3 className="ls-modal-title">Pick a title</h3>
                </div>
                <button className="btn icon" onClick={() => setShowAddMovieModal(false)} aria-label="Close">
                  <Icon name="close" size={16} />
                </button>
              </header>
              <div className="ls-modal-body">
                <div className="ls-search">
                  <div className="input-group" style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--bone-mute)' }}>
                      <Icon name="search" size={16} />
                    </span>
                    <input
                      type="text"
                      placeholder="Title, director, year…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      style={{ paddingLeft: 40 }}
                    />
                  </div>
                  <button className="btn" onClick={handleSearch} disabled={searching}>
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <ul className="ls-search-results">
                    {searchResults.map((movie) => (
                      <li
                        key={movie.id}
                        className="ls-search-result"
                        onClick={() => handleAddMovie(movie)}
                      >
                        {movie.posterPath ? (
                          <img src={movie.posterPath} alt={movie.title} loading="lazy" />
                        ) : (
                          <div className="ls-search-placeholder">?</div>
                        )}
                        <div className="ls-search-info">
                          <span className="ls-search-title">{movie.title}</span>
                          {movie.year && <span className="ls-search-year">{movie.year}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Lists overview ── */
  return (
    <div className="lists-page">
      <PageHeader
        eyebrow="Curated"
        title={<>Movie <em>lists.</em></>}
        meta={[`${myLists.length + publicLists.length} total`]}
        actions={isAuthenticated && (
          <button className="btn" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={14} /> <span>New list</span>
          </button>
        )}
      />

      {isAuthenticated && myLists.length > 0 && (
        <section>
          <SectionHead num="01" title="Yours" meta={`${myLists.length} list${myLists.length !== 1 ? 's' : ''}`} />
          <div className="ls-grid">
            {myLists.map((list) => (
              <Link key={list.id} to={`/lists/${list.id}`} className="ls-card">
                <header className="ls-card-head">
                  <h3 className="ls-card-title">{list.name}</h3>
                  <Chip variant={list.is_public ? 'accent' : 'default'}>
                    {list.is_public ? 'Public' : 'Private'}
                  </Chip>
                </header>
                {list.description && <p className="ls-card-desc">{list.description}</p>}
                <footer className="ls-card-meta">
                  <span>{list.item_count} title{list.item_count !== 1 ? 's' : ''}</span>
                  <Icon name="arrow-right" size={14} className="ls-card-arrow" />
                </footer>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead
          num={isAuthenticated && myLists.length > 0 ? '02' : '01'}
          title="From the club"
          meta={`${publicLists.length} public`}
        />
        {publicLists.length === 0 ? (
          <EmptyState
            icon={<Icon name="list" size={32} stroke={1.25} />}
            title="No public lists yet."
            body={isAuthenticated ? 'Create the first one.' : 'Log in to create a list.'}
            action={isAuthenticated && (
              <button className="btn" onClick={() => setShowCreateModal(true)}>Create a list</button>
            )}
          />
        ) : (
          <div className="ls-grid">
            {publicLists.map((list) => (
              <Link key={list.id} to={`/lists/${list.id}`} className="ls-card">
                <header className="ls-card-head">
                  <h3 className="ls-card-title">{list.name}</h3>
                </header>
                {list.description && <p className="ls-card-desc">{list.description}</p>}
                <footer className="ls-card-meta">
                  <span>by {list.username}</span>
                  <span className="sep" />
                  <span>{list.item_count} title{list.item_count !== 1 ? 's' : ''}</span>
                  <Icon name="arrow-right" size={14} className="ls-card-arrow" />
                </footer>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Create list modal */}
      {showCreateModal && (
        <div className="ls-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ls-modal-head">
              <div>
                <div className="ls-modal-eyebrow">New list</div>
                <h3 className="ls-modal-title">Start a new list</h3>
              </div>
              <button className="btn icon" onClick={() => setShowCreateModal(false)} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </header>
            <form onSubmit={handleCreateList}>
              <div className="ls-modal-body">
                <label className="ls-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Kubrick Complete"
                    maxLength={100}
                    required
                  />
                </label>
                <label className="ls-field">
                  <span>Description</span>
                  <textarea
                    value={newListDescription}
                    onChange={(e) => setNewListDescription(e.target.value)}
                    placeholder="A short note about this list…"
                    rows={3}
                  />
                </label>
                <label className="ls-checkbox">
                  <input
                    type="checkbox"
                    checked={newListPublic}
                    onChange={(e) => setNewListPublic(e.target.checked)}
                  />
                  <span>Make this list public</span>
                </label>
              </div>
              <footer className="ls-modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={creating}>
                  {creating ? 'Creating…' : 'Create list'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListsPage;
