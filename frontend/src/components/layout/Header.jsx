import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl } from '../../utils/helpers';
import { searchTMDB, getTMDBMovie, announceMovie } from '../../api/client';
import { Icon } from '../ui';
import NotificationBell from './NotificationBell';
import './Header.css';

const PRIMARY_NAV = [
  { to: '/',            label: 'Tonight',  icon: 'home',  end: true },
  { to: '/movies',      label: 'Archive',  icon: 'film' },
  { to: '/wishlist',    label: 'Wishlist', icon: 'bookmark' },
  { to: '/stats',       label: 'Stats',    icon: 'chart' },
  { to: '/feed',        label: 'Feed',     icon: 'feed' },
];

const MORE_NAV = [
  { to: '/my-movies',    label: 'My ratings',  icon: 'star' },
  { to: '/profile',      label: 'My profile',  icon: 'user' },
  { to: '/collections',  label: 'Collections', icon: 'folder' },
  { to: '/lists',        label: 'Lists',       icon: 'list' },
  { to: '/achievements', label: 'Achievements', icon: 'trophy' },
  { to: '/commands',     label: 'Commands',    icon: 'terminal' },
];

const Header = () => {
  const { user, login, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const avatarUrl = user ? getAvatarUrl(user.discordId, user.avatar) : null;

  useEffect(() => {
    const onClick = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <header className="header">
      <div className="container header-content">

        <Link to="/" className="logo" aria-label="MovieNight home">
          <span className="logo-mark" aria-hidden="true">m</span>
          <span className="logo-text">MovieNight</span>
        </Link>

        <nav className="nav">
          {PRIMARY_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={16} stroke={1.5} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="header-right">
          {isAuthenticated && (
            <button
              className="btn"
              onClick={() => setShowAnnounceModal(true)}
              aria-label="Announce next movie"
            >
              <Icon name="megaphone" size={16} stroke={1.75} />
              <span>Announce</span>
            </button>
          )}

          {isAuthenticated && <NotificationBell />}

          {isAuthenticated ? (
            <div className="user-menu" ref={menuRef}>
              <button
                className="user-trigger"
                onClick={() => setMenuOpen(o => !o)}
                aria-expanded={menuOpen}
              >
                {avatarUrl && <img src={avatarUrl} alt="" className="avatar" loading="lazy" />}
                <span className="username">{user.username}</span>
                <Icon name="chevron" size={14} stroke={1.5} className={`chev ${menuOpen ? 'open' : ''}`} />
              </button>
              {menuOpen && (
                <div className="user-menu-panel" role="menu">
                  <div className="menu-eyebrow">Your shelf</div>
                  {MORE_NAV.map(item => (
                    <Link key={item.to} to={item.to} className="menu-item" role="menuitem">
                      <Icon name={item.icon} size={16} stroke={1.5} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                  <div className="menu-sep" />
                  <button onClick={logout} className="menu-item danger" role="menuitem">
                    <Icon name="logout" size={16} stroke={1.5} />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={login} className="btn">
              Log in with Discord
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

/* ─── Announce modal ──────────────────────────────────────────────────── */

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
        <header className="announce-modal-header">
          <div>
            <div className="announce-modal-eyebrow">
              {step === 'success' ? 'Scheduled' : 'The next reel'}
            </div>
            <h2>{step === 'success' ? 'Announced.' : 'Announce a movie night'}</h2>
          </div>
          <button className="btn icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        {step === 'search' && (
          <div className="announce-modal-body">
            <form onSubmit={handleSearch} className="announce-modal-search">
              <div className="input-group" style={{ flex: 1, position: 'relative' }}>
                <span className="input-icon" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--bone-mute)' }}>
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Title, director, year…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  style={{ paddingLeft: 40 }}
                />
              </div>
              <button type="submit" className="btn" disabled={searching}>
                {searching ? '…' : 'Search'}
              </button>
            </form>
            {error && <div className="announce-modal-error">{error}</div>}
            {results.length > 0 && (
              <ul className="announce-modal-results">
                {results.slice(0, 8).map((movie) => (
                  <li key={movie.id} className="announce-modal-result" onClick={() => handleSelect(movie)}>
                    {movie.posterPath ? (
                      <img src={movie.posterPath} alt="" className="announce-modal-poster" />
                    ) : (
                      <div className="announce-modal-poster no-poster">?</div>
                    )}
                    <div className="announce-modal-result-body">
                      <span className="announce-modal-title">{movie.title}</span>
                      {movie.year && <span className="announce-modal-year">{movie.year}</span>}
                    </div>
                  </li>
                ))}
              </ul>
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
                  {selectedMovie.runtime > 0 && <span>· {Math.floor(selectedMovie.runtime / 60)}h {selectedMovie.runtime % 60}m</span>}
                  {selectedMovie.rating > 0 && <span>· TMDB {selectedMovie.rating}</span>}
                </div>
                {selectedMovie.overview && (
                  <p className="announce-modal-overview">{selectedMovie.overview}</p>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="announce-modal-schedule">
              <div className="announce-modal-fields">
                <label className="field">Date
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required />
                </label>
                <label className="field">Time
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                </label>
              </div>
              {error && <div className="announce-modal-error">{error}</div>}
              <div className="announce-modal-actions">
                <button type="button" className="btn ghost" onClick={() => { setStep('search'); setSelectedMovie(null); }}>
                  Back
                </button>
                <button type="submit" className="btn" disabled={announcing}>
                  {announcing ? 'Scheduling…' : 'Announce'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'success' && (
          <div className="announce-modal-body announce-modal-success">
            <div className="announce-success-check">
              <Icon name="check" size={28} stroke={2} />
            </div>
            <h3>It's on the schedule.</h3>
            <p><em>{selectedMovie?.title}</em> is announced.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
