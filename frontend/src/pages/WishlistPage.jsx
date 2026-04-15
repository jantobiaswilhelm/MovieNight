import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyWishlist, getGuildWishlist } from '../api/client';
import { useFetch, useModal } from '../hooks';
import { WishlistCard, AddToWishlistModal, WishlistDetailModal } from '../components/wishlist';
import { getAvatarUrl } from '../utils/helpers';
import { Icon, PageHeader, Chip, EmptyState } from '../components/ui';
import './WishlistPage.css';

const WishlistPage = () => {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('my');
  const [sort, setSort] = useState('importance');
  const [groupByUser, setGroupByUser] = useState(false);
  const [randomMovie, setRandomMovie] = useState(null);
  const [showRandomModal, setShowRandomModal] = useState(false);

  const addModal = useModal();
  const detailModal = useModal();

  const fetchFn = async () => {
    if (activeTab === 'my') {
      if (!isAuthenticated) return [];
      return await getMyWishlist(sort);
    }
    return await getGuildWishlist(sort);
  };

  const { data: items, loading, error, refetch, setData: setItems } = useFetch(
    fetchFn,
    [activeTab, sort, isAuthenticated],
    { initialData: [] }
  );

  const handleUpdate = useCallback((updatedItem) => {
    setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
  }, [setItems]);

  const handleRemove = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (detailModal.data?.id === id) detailModal.close();
  }, [setItems, detailModal]);

  const handleAdded = useCallback(() => { refetch(); }, [refetch]);
  const handleCardClick = useCallback((item) => { detailModal.open(item); }, [detailModal]);

  const handleAnnounce = (item) => {
    if (item) handleRemove(item.id);
    detailModal.close();
  };

  const pickRandomMovie = () => {
    if (items.length === 0) return;
    setRandomMovie(items[Math.floor(Math.random() * items.length)]);
    setShowRandomModal(true);
  };

  const rerollRandomMovie = () => {
    if (items.length <= 1) return;
    let newMovie;
    do {
      newMovie = items[Math.floor(Math.random() * items.length)];
    } while (newMovie.id === randomMovie?.id && items.length > 1);
    setRandomMovie(newMovie);
  };

  const handleScheduleRandom = () => {
    setShowRandomModal(false);
    detailModal.open(randomMovie);
  };

  const groupedItems = groupByUser
    ? items.reduce((acc, item) => {
        const key = item.username;
        if (!acc[key]) {
          acc[key] = { username: item.username, avatar: item.avatar, discord_id: item.discord_id, items: [] };
        }
        acc[key].items.push(item);
        return acc;
      }, {})
    : null;

  return (
    <div className="wishlist-page">
      <PageHeader
        eyebrow="Reels to come"
        title={<>The <em>wishlist.</em></>}
        meta={[`${items.length} title${items.length !== 1 ? 's' : ''}`, activeTab === 'my' ? 'yours' : 'shared']}
        actions={
          <>
            {items.length > 0 && (
              <button className="btn ghost" onClick={pickRandomMovie}>
                <Icon name="star" size={14} />
                <span>Pick random</span>
              </button>
            )}
            {isAuthenticated && (
              <button className="btn" onClick={() => addModal.open()}>
                <Icon name="plus" size={14} />
                <span>Add movie</span>
              </button>
            )}
          </>
        }
      />

      <div className="wl-controls">
        <div className="wl-tabs" role="tablist">
          <button
            className={`wl-tab ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
            role="tab"
          >
            Mine
          </button>
          <button
            className={`wl-tab ${activeTab === 'guild' ? 'active' : ''}`}
            onClick={() => setActiveTab('guild')}
            role="tab"
          >
            The Club
          </button>
        </div>

        <div className="wl-filters">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="importance">By priority</option>
            <option value="newest">Newest first</option>
            <option value="alphabetical">A → Z</option>
          </select>

          {activeTab === 'guild' && (
            <label className="wl-checkbox">
              <input
                type="checkbox"
                checked={groupByUser}
                onChange={(e) => setGroupByUser(e.target.checked)}
              />
              <span>Group by user</span>
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : activeTab === 'my' && !isAuthenticated ? (
        <EmptyState
          icon={<Icon name="user" size={32} stroke={1.25} />}
          title="Log in to build your list."
          body="Discord sign-in saves your wishlist across devices."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon name="bookmark" size={32} stroke={1.25} />}
          title={activeTab === 'my' ? 'Your wishlist is empty.' : 'The club hasn\u2019t wished for anything yet.'}
          body={activeTab === 'my' ? 'Start with one title. Add more as you discover them.' : 'Members can add their picks from any movie detail page.'}
          action={isAuthenticated && activeTab === 'my' && (
            <button className="btn" onClick={() => addModal.open()}>Add your first movie</button>
          )}
        />
      ) : groupByUser && activeTab === 'guild' ? (
        <div className="wl-groups">
          {Object.values(groupedItems).map((group) => (
            <section key={group.username} className="wl-group">
              <header className="wl-group-head">
                <img
                  src={getAvatarUrl(group.discord_id, group.avatar)}
                  alt={group.username}
                  className="wl-group-avatar"
                  loading="lazy"
                />
                <span className="wl-group-user">{group.username}</span>
                <span className="wl-group-count">{group.items.length} title{group.items.length !== 1 ? 's' : ''}</span>
                <span className="wl-group-rule" />
              </header>
              <div className="wl-grid">
                {group.items.map((item) => (
                  <WishlistCard
                    key={item.id}
                    item={item}
                    isOwner={user?.id === item.user_id}
                    showUser={false}
                    onUpdate={handleUpdate}
                    onRemove={handleRemove}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="wl-grid">
          {items.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              isOwner={user?.id === item.user_id}
              showUser={activeTab === 'guild'}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}

      <div className="wl-browse">
        <Link to="/movies" className="btn text">Browse the archive →</Link>
      </div>

      <AddToWishlistModal
        isOpen={addModal.isOpen}
        onClose={addModal.close}
        onAdded={handleAdded}
      />

      <WishlistDetailModal
        item={detailModal.data}
        isOpen={detailModal.isOpen}
        onClose={detailModal.close}
        onAnnounce={handleAnnounce}
        canAnnounce={isAuthenticated}
      />

      {/* ── Random pick modal ── */}
      {showRandomModal && randomMovie && (
        <div className="wl-random-overlay" onClick={() => setShowRandomModal(false)}>
          <div className="wl-random" onClick={(e) => e.stopPropagation()}>
            <header className="wl-random-head">
              <div>
                <div className="wl-random-eyebrow">A random pick</div>
                <h3 className="wl-random-title">The dice say…</h3>
              </div>
              <button className="btn icon" onClick={() => setShowRandomModal(false)} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className="wl-random-body">
              {randomMovie.image_url && (
                <img
                  src={randomMovie.image_url}
                  alt={randomMovie.title}
                  className="wl-random-poster"
                  loading="lazy"
                />
              )}
              <div className="wl-random-info">
                <h4 className="wl-random-movie">{randomMovie.title}</h4>
                <div className="wl-random-meta">
                  {randomMovie.release_year && <span>{randomMovie.release_year}</span>}
                  {randomMovie.tmdb_rating && (
                    <>
                      <span className="sep" />
                      <span className="wl-random-score">{parseFloat(randomMovie.tmdb_rating).toFixed(1)}<sub>/10</sub></span>
                    </>
                  )}
                </div>
                {randomMovie.genres && (
                  <div className="wl-random-chips">
                    {randomMovie.genres.split(',').slice(0, 3).map((genre, i) => (
                      <Chip key={i} variant={i === 0 ? 'accent' : 'default'}>{genre.trim()}</Chip>
                    ))}
                  </div>
                )}
                {randomMovie.description && (
                  <p className="wl-random-desc">{randomMovie.description}</p>
                )}
                {activeTab === 'guild' && randomMovie.username && (
                  <p className="wl-random-by">Added by <em>{randomMovie.username}</em></p>
                )}
              </div>
            </div>
            <footer className="wl-random-actions">
              <button
                className="btn ghost"
                onClick={rerollRandomMovie}
                disabled={items.length <= 1}
              >
                Reroll
              </button>
              {isAuthenticated && (
                <button className="btn" onClick={handleScheduleRandom}>
                  <Icon name="calendar" size={14} /> <span>Schedule this one</span>
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
