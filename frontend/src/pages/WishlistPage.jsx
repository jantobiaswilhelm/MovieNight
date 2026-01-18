import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyWishlist, getGuildWishlist } from '../api/client';
import WishlistCard from '../components/WishlistCard';
import AddToWishlistModal from '../components/AddToWishlistModal';
import WishlistDetailModal from '../components/WishlistDetailModal';
import './WishlistPage.css';

const WishlistPage = () => {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('my');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('importance');
  const [groupByUser, setGroupByUser] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [randomMovie, setRandomMovie] = useState(null);
  const [showRandomModal, setShowRandomModal] = useState(false);

  const fetchWishlist = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'my') {
        if (!isAuthenticated) {
          setItems([]);
          setLoading(false);
          return;
        }
        const data = await getMyWishlist(sort);
        setItems(data);
      } else {
        const data = await getGuildWishlist(sort);
        setItems(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [activeTab, sort, isAuthenticated]);

  const handleUpdate = (updatedItem) => {
    setItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  const handleRemove = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  const handleAdded = () => {
    fetchWishlist();
  };

  const handleCardClick = (item) => {
    setSelectedItem(item);
  };

  const handleAnnounce = (item) => {
    // Remove from wishlist after scheduling (called from WishlistDetailModal)
    if (item) {
      handleRemove(item.id);
    }
    setSelectedItem(null);
  };

  const pickRandomMovie = () => {
    if (items.length === 0) return;
    const randomIndex = Math.floor(Math.random() * items.length);
    setRandomMovie(items[randomIndex]);
    setShowRandomModal(true);
  };

  const rerollRandomMovie = () => {
    if (items.length <= 1) return;
    let newIndex;
    let newMovie;
    // Ensure we pick a different movie
    do {
      newIndex = Math.floor(Math.random() * items.length);
      newMovie = items[newIndex];
    } while (newMovie.id === randomMovie?.id && items.length > 1);
    setRandomMovie(newMovie);
  };

  const handleScheduleRandom = () => {
    // Close random modal and open detail modal with the random movie
    setShowRandomModal(false);
    setSelectedItem(randomMovie);
  };

  const groupedItems = groupByUser
    ? items.reduce((acc, item) => {
        const key = item.username;
        if (!acc[key]) {
          acc[key] = {
            username: item.username,
            avatar: item.avatar,
            discord_id: item.discord_id,
            items: []
          };
        }
        acc[key].items.push(item);
        return acc;
      }, {})
    : null;

  const getAvatarUrl = (discordId, avatar) => {
    if (!avatar) return null;
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  };

  return (
    <div className="wishlist-page">
      <div className="wishlist-header">
        <h1>Wishlist</h1>

        <div className="wishlist-header-actions">
          {items.length > 0 && (
            <button
              className="btn-secondary random-pick-btn"
              onClick={pickRandomMovie}
            >
              🎲 Pick Random
            </button>
          )}
          {isAuthenticated && (
            <button
              className="btn-primary add-movie-btn"
              onClick={() => setShowAddModal(true)}
            >
              + Add Movie
            </button>
          )}
        </div>
      </div>

      <div className="wishlist-controls">
        <div className="tab-toggle">
          <button
            className={`tab-btn ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            My Wishlist
          </button>
          <button
            className={`tab-btn ${activeTab === 'guild' ? 'active' : ''}`}
            onClick={() => setActiveTab('guild')}
          >
            OnlyFans Wishlist
          </button>
        </div>

        <div className="filter-controls">
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="importance">Sort by Priority</option>
            <option value="newest">Sort by Newest</option>
            <option value="alphabetical">Sort A-Z</option>
          </select>

          {activeTab === 'guild' && (
            <label className="group-checkbox">
              <input
                type="checkbox"
                checked={groupByUser}
                onChange={(e) => setGroupByUser(e.target.checked)}
              />
              Group by user
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : error ? (
        <div className="error-state">{error}</div>
      ) : activeTab === 'my' && !isAuthenticated ? (
        <div className="empty-state">
          <p>Login to create your personal wishlist</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>
            {activeTab === 'my'
              ? 'Your wishlist is empty. Add some movies!'
              : 'No movies in the guild wishlist yet.'}
          </p>
        </div>
      ) : groupByUser && activeTab === 'guild' ? (
        <div className="wishlist-grouped">
          {Object.values(groupedItems).map((group) => (
            <div key={group.username} className="user-group">
              <div className="user-group-header">
                {getAvatarUrl(group.discord_id, group.avatar) && (
                  <img
                    src={getAvatarUrl(group.discord_id, group.avatar)}
                    alt=""
                    className="group-avatar"
                  />
                )}
                <span className="group-username">{group.username}</span>
                <span className="group-count">({group.items.length})</span>
              </div>
              <div className="wishlist-grid">
                {group.items.map((item) => (
                  <WishlistCard
                    key={item.id}
                    item={item}
                    isOwner={user?.id === item.user_id}
                    showUser={false}
                    onUpdate={handleUpdate}
                    onRemove={handleRemove}
                    onClick={() => handleCardClick(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="wishlist-grid">
          {items.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              isOwner={user?.id === item.user_id}
              showUser={activeTab === 'guild'}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
              onClick={() => handleCardClick(item)}
            />
          ))}
        </div>
      )}

      <AddToWishlistModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={handleAdded}
      />

      <WishlistDetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onAnnounce={handleAnnounce}
        canAnnounce={isAuthenticated}
      />

      {/* Random Movie Picker Modal */}
      {showRandomModal && randomMovie && (
        <div className="modal-overlay" onClick={() => setShowRandomModal(false)}>
          <div className="modal-content random-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🎲 Random Pick</h2>
              <button className="modal-close" onClick={() => setShowRandomModal(false)}>×</button>
            </div>
            <div className="random-movie-display">
              {randomMovie.image_url && (
                <img
                  src={randomMovie.image_url}
                  alt={randomMovie.title}
                  className="random-movie-poster"
                />
              )}
              <div className="random-movie-info">
                <h3 className="random-movie-title">{randomMovie.title}</h3>
                {randomMovie.release_year && (
                  <span className="random-movie-year">{randomMovie.release_year}</span>
                )}
                {randomMovie.tmdb_rating && (
                  <span className="random-movie-rating">⭐ {parseFloat(randomMovie.tmdb_rating).toFixed(1)}</span>
                )}
                {randomMovie.genres && (
                  <div className="random-movie-genres">
                    {randomMovie.genres.split(',').slice(0, 3).map((genre, i) => (
                      <span key={i} className="genre-tag">{genre.trim()}</span>
                    ))}
                  </div>
                )}
                {randomMovie.description && (
                  <p className="random-movie-description">{randomMovie.description}</p>
                )}
                {activeTab === 'guild' && randomMovie.username && (
                  <span className="random-movie-user">Added by {randomMovie.username}</span>
                )}
              </div>
            </div>
            <div className="random-modal-actions">
              <button
                className="btn-secondary"
                onClick={rerollRandomMovie}
                disabled={items.length <= 1}
              >
                🎲 Reroll
              </button>
              {isAuthenticated && (
                <button
                  className="btn-primary"
                  onClick={handleScheduleRandom}
                >
                  📅 Schedule This Movie
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
