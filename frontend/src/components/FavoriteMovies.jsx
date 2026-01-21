import { useState } from 'react';
import { Link } from 'react-router-dom';
import { removeFavoriteMovie } from '../api/client';
import FavoriteMoviePicker from './FavoriteMoviePicker';
import './FavoriteMovies.css';

const FavoriteMovies = ({ favorites, onUpdate, isOwner = true }) => {
  const [editMode, setEditMode] = useState(false);
  const [pickerPosition, setPickerPosition] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Create a map for quick lookup
  const favoritesByPosition = {};
  favorites.forEach(fav => {
    favoritesByPosition[fav.position] = fav;
  });

  const handleSlotClick = (position) => {
    if (!isOwner) return;
    if (editMode) {
      setPickerPosition(position);
    }
  };

  const handleRemove = async (position, e) => {
    e.stopPropagation();
    if (!window.confirm('Remove this movie from your favorites?')) return;

    setIsUpdating(true);
    try {
      await removeFavoriteMovie(position);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Failed to remove favorite:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePickerSelect = () => {
    setPickerPosition(null);
    if (onUpdate) onUpdate();
  };

  const slots = [1, 2, 3, 4, 5];

  return (
    <div className={`favorite-movies ${isUpdating ? 'updating' : ''}`}>
      <div className="favorite-movies-header">
        <h3>Favorite Movies</h3>
        {isOwner && (
          <button
            className={`edit-favorites-btn ${editMode ? 'active' : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      <div className="favorite-slots">
        {slots.map((position) => {
          const movie = favoritesByPosition[position];

          return (
            <div
              key={position}
              className={`favorite-slot ${movie ? 'filled' : 'empty'} ${editMode && isOwner ? 'editable' : ''}`}
              onClick={() => handleSlotClick(position)}
            >
              {movie ? (
                <>
                  {editMode && isOwner && (
                    <button
                      className="remove-favorite-btn"
                      onClick={(e) => handleRemove(position, e)}
                    >
                      ×
                    </button>
                  )}
                  {!editMode ? (
                    <Link to={`/movie/${movie.movie_night_id}`} className="favorite-link">
                      <div className="favorite-poster">
                        {movie.image_url ? (
                          <img src={movie.image_url} alt={movie.title} />
                        ) : (
                          <div className="no-poster">{position}</div>
                        )}
                      </div>
                      <div className="favorite-info">
                        <span className="favorite-title">{movie.title}</span>
                        {movie.release_year && (
                          <span className="favorite-year">{movie.release_year}</span>
                        )}
                      </div>
                    </Link>
                  ) : (
                    <>
                      <div className="favorite-poster">
                        {movie.image_url ? (
                          <img src={movie.image_url} alt={movie.title} />
                        ) : (
                          <div className="no-poster">{position}</div>
                        )}
                      </div>
                      <div className="favorite-info">
                        <span className="favorite-title">{movie.title}</span>
                        {movie.release_year && (
                          <span className="favorite-year">{movie.release_year}</span>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="empty-slot">
                  <span className="slot-number">{position}</span>
                  {editMode && isOwner && <span className="add-hint">+ Add</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pickerPosition && (
        <FavoriteMoviePicker
          position={pickerPosition}
          currentFavorites={favorites}
          onSelect={handlePickerSelect}
          onClose={() => setPickerPosition(null)}
        />
      )}
    </div>
  );
};

export default FavoriteMovies;
