import { Link } from 'react-router-dom';
import './ProfileWishlist.css';

const ProfileWishlist = ({ wishlist }) => {
  if (!wishlist || wishlist.length === 0) {
    return (
      <div className="profile-wishlist">
        <div className="profile-wishlist-header">
          <h3>Wishlist</h3>
          <Link to="/wishlist" className="view-all-link">View All</Link>
        </div>
        <p className="wishlist-empty">No movies in wishlist</p>
      </div>
    );
  }

  return (
    <div className="profile-wishlist">
      <div className="profile-wishlist-header">
        <h3>Wishlist</h3>
        <Link to="/wishlist" className="view-all-link">View All</Link>
      </div>

      <div className="wishlist-preview-list">
        {wishlist.map((item) => (
          <div key={item.id} className="wishlist-preview-item">
            <div className="wishlist-preview-poster">
              {item.image_url ? (
                <img src={item.image_url} alt={item.title} />
              ) : (
                <div className="no-poster">?</div>
              )}
            </div>
            <div className="wishlist-preview-info">
              <span className="wishlist-preview-title">{item.title}</span>
              <div className="wishlist-preview-meta">
                {item.tmdb_rating && (
                  <span className="wishlist-preview-rating">
                    TMDB: {parseFloat(item.tmdb_rating).toFixed(1)}
                  </span>
                )}
                <span className="wishlist-preview-importance">
                  {'★'.repeat(item.importance)}{'☆'.repeat(5 - item.importance)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfileWishlist;
