import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl } from '../../utils/helpers';
import { searchTMDB, getTMDBMovie, announceMovie } from '../../api/client';
import ThemeSwitcher from '../common/ThemeSwitcher';
import NotificationBell from './NotificationBell';
import './Header.css';

const Header = () => {
  const { user, login, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const dropdownRefs = useRef({});

  const avatarUrl = user ? getAvatarUrl(user.discordId, user.avatar) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && dropdownRefs.current[openDropdown]) {
        if (!dropdownRefs.current[openDropdown].contains(event.target)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
  }, [location.pathname]);

  const handleMouseEnter = (name) => {
    setOpenDropdown(name);
  };

  const handleMouseLeave = () => {
    setOpenDropdown(null);
  };

  const isActiveInGroup = (paths) => {
    return paths.some(path => location.pathname.startsWith(path));
  };

  const browseItems = [
    { to: '/movies', label: 'Movies', icon: '🎬', desc: 'All movie nights' },
    { to: '/collections', label: 'Collections', icon: '📚', desc: 'Movie franchises' },
    { to: '/wishlist', label: 'Wishlist', icon: '⭐', desc: 'Movies to watch' },
    { to: '/lists', label: 'Lists', icon: '📋', desc: 'Curated lists' },
    { to: '/commands', label: 'Commands', icon: '🤖', desc: 'Discord bot commands' },
  ];

  const socialItems = [
    { to: '/feed', label: 'Activity Feed', icon: '📰', desc: 'See what others watched' },
    { to: '/stats', label: 'Statistics', icon: '📊', desc: 'Leaderboards & data' },
    { to: '/achievements', label: 'Achievements', icon: '🏆', desc: 'Badges & milestones' },
  ];

  const myStuffItems = [
    { to: '/my-movies', label: 'My Movies', icon: '🎥', desc: 'Your personal ratings' },
    { to: '/profile', label: 'My Profile', icon: '👤', desc: 'Your stats & favorites' },
  ];

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          Movie Night
        </Link>

        <nav className="nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Home
          </Link>

          {/* Browse Dropdown */}
          <div
            className="nav-dropdown"
            ref={el => dropdownRefs.current.browse = el}
            onMouseEnter={() => handleMouseEnter('browse')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              className={`nav-dropdown-trigger ${isActiveInGroup(['/movies', '/collections', '/wishlist', '/lists', '/commands']) ? 'active' : ''}`}
            >
              Browse
              <svg className={`dropdown-arrow ${openDropdown === 'browse' ? 'open' : ''}`} viewBox="0 0 12 12">
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            {openDropdown === 'browse' && (
              <div className="nav-dropdown-menu">
                {browseItems.map(item => (
                  <Link key={item.to} to={item.to} className="nav-dropdown-item">
                    <span className="nav-dropdown-icon">{item.icon}</span>
                    <div className="nav-dropdown-text">
                      <span className="nav-dropdown-label">{item.label}</span>
                      <span className="nav-dropdown-desc">{item.desc}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Social Dropdown */}
          <div
            className="nav-dropdown"
            ref={el => dropdownRefs.current.social = el}
            onMouseEnter={() => handleMouseEnter('social')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              className={`nav-dropdown-trigger ${isActiveInGroup(['/feed', '/stats', '/achievements']) ? 'active' : ''}`}
            >
              Social
              <svg className={`dropdown-arrow ${openDropdown === 'social' ? 'open' : ''}`} viewBox="0 0 12 12">
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            {openDropdown === 'social' && (
              <div className="nav-dropdown-menu">
                {socialItems.map(item => (
                  <Link key={item.to} to={item.to} className="nav-dropdown-item">
                    <span className="nav-dropdown-icon">{item.icon}</span>
                    <div className="nav-dropdown-text">
                      <span className="nav-dropdown-label">{item.label}</span>
                      <span className="nav-dropdown-desc">{item.desc}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* My Stuff Dropdown - Only when authenticated */}
          {isAuthenticated && (
            <div
              className="nav-dropdown"
              ref={el => dropdownRefs.current.mystuff = el}
              onMouseEnter={() => handleMouseEnter('mystuff')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className={`nav-dropdown-trigger ${isActiveInGroup(['/my-movies', '/profile']) ? 'active' : ''}`}
              >
                My Stuff
                <svg className={`dropdown-arrow ${openDropdown === 'mystuff' ? 'open' : ''}`} viewBox="0 0 12 12">
                  <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              {openDropdown === 'mystuff' && (
                <div className="nav-dropdown-menu">
                  {myStuffItems.map(item => (
                    <Link key={item.to} to={item.to} className="nav-dropdown-item">
                      <span className="nav-dropdown-icon">{item.icon}</span>
                      <div className="nav-dropdown-text">
                        <span className="nav-dropdown-label">{item.label}</span>
                        <span className="nav-dropdown-desc">{item.desc}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

        </nav>

        {isAuthenticated && (
          <button className="announce-cta-btn" onClick={() => setShowAnnounceModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
              <line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="2" y1="7" x2="7" y2="7"/>
              <line x1="2" y1="17" x2="7" y2="17"/>
              <line x1="17" y1="7" x2="22" y2="7"/>
              <line x1="17" y1="17" x2="22" y2="17"/>
            </svg>
            Announce Next Movie
          </button>
        )}

        <div className="header-right">
          <ThemeSwitcher />
          {isAuthenticated && <NotificationBell />}
          {isAuthenticated ? (
            <div className="user-menu">
              {avatarUrl && (
                <img src={avatarUrl} alt={user.username} className="avatar" loading="lazy" />
              )}
              <span className="username">{user.username}</span>
              <button onClick={logout} className="btn-logout">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={login} className="btn-primary">
              Login with Discord
            </button>
          )}
        </div>
      </div>

      {showAnnounceModal && createPortal(
        <AnnounceModal onClose={() => setShowAnnounceModal(false)} />,
        document.body
      )}
    </header>
  );
};

const AnnounceModal = ({ onClose }) => {
  const [step, setStep] = useState('search');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('20:00');
  const [announcing, setAnnouncing] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await searchTMDB(search);
      setResults(data);
    } catch {
      setError('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (movie) => {
    setSearching(true);
    setError(null);
    try {
      const details = await getTMDBMovie(movie.id);
      setSelectedMovie(details);
      setStep('preview');
    } catch {
      setError('Failed to load movie details');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMovie || !date || !time) {
      setError('Please select a date and time');
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }
    setAnnouncing(true);
    setError(null);
    try {
      await announceMovie(selectedMovie, scheduledAt.toISOString());
      setStep('success');
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to announce movie');
    } finally {
      setAnnouncing(false);
    }
  };

  return (
    <div className="announce-modal-overlay" onClick={onClose}>
      <div className="announce-modal" onClick={(e) => e.stopPropagation()}>
        <div className="announce-modal-header">
          <h2>{step === 'success' ? 'Done!' : 'Announce Movie Night'}</h2>
          <button className="announce-modal-close" onClick={onClose}>&times;</button>
        </div>

        {step === 'search' && (
          <div className="announce-modal-body">
            <form onSubmit={handleSearch} className="announce-modal-search">
              <input
                type="text"
                placeholder="Search for a movie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={searching}>
                {searching ? '...' : 'Search'}
              </button>
            </form>
            {error && <div className="announce-modal-error">{error}</div>}
            {results.length > 0 && (
              <div className="announce-modal-results">
                {results.slice(0, 8).map((movie) => (
                  <div key={movie.id} className="announce-modal-result" onClick={() => handleSelect(movie)}>
                    {movie.posterPath ? (
                      <img src={movie.posterPath} alt="" className="announce-modal-poster" />
                    ) : (
                      <div className="announce-modal-poster no-poster">?</div>
                    )}
                    <div>
                      <span className="announce-modal-title">{movie.title}</span>
                      {movie.year && <span className="announce-modal-year">{movie.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'preview' && selectedMovie && (
          <div className="announce-modal-body">
            <div className="announce-modal-preview">
              {selectedMovie.posterPath && (
                <img src={selectedMovie.posterPath} alt="" className="announce-modal-preview-poster" />
              )}
              <div className="announce-modal-preview-info">
                <h3>{selectedMovie.title}</h3>
                <div className="announce-modal-meta">
                  {selectedMovie.year && <span>{selectedMovie.year}</span>}
                  {selectedMovie.runtime > 0 && <span>{Math.floor(selectedMovie.runtime / 60)}h {selectedMovie.runtime % 60}m</span>}
                  {selectedMovie.rating > 0 && <span>TMDB {selectedMovie.rating}</span>}
                </div>
                {selectedMovie.overview && (
                  <p className="announce-modal-overview">{selectedMovie.overview}</p>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="announce-modal-schedule">
              <div className="announce-modal-fields">
                <div className="announce-modal-field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="announce-modal-field">
                  <label>Time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                </div>
              </div>
              {error && <div className="announce-modal-error">{error}</div>}
              <div className="announce-modal-actions">
                <button type="button" className="btn-back" onClick={() => { setStep('search'); setSelectedMovie(null); }}>
                  Back
                </button>
                <button type="submit" className="btn-announce" disabled={announcing}>
                  {announcing ? 'Scheduling...' : 'Announce Movie Night'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'success' && (
          <div className="announce-modal-body announce-modal-success">
            <div className="announce-success-check">{'\u2713'}</div>
            <h3>Movie Night Announced!</h3>
            <p><strong>{selectedMovie?.title}</strong> has been scheduled.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
