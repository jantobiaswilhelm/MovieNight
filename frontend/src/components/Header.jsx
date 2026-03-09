import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeSwitcher from './ThemeSwitcher';
import NotificationBell from './NotificationBell';
import './Header.css';

const Header = () => {
  const { user, login, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRefs = useRef({});

  const getAvatarUrl = () => {
    if (!user?.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
  };

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
              className={`nav-dropdown-trigger ${isActiveInGroup(['/movies', '/collections', '/wishlist', '/lists']) ? 'active' : ''}`}
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

        <div className="header-actions">
          <ThemeSwitcher />
          {isAuthenticated && <NotificationBell />}
        </div>

        <div className="auth">
          {isAuthenticated ? (
            <div className="user-menu">
              {getAvatarUrl() && (
                <img src={getAvatarUrl()} alt="" className="avatar" />
              )}
              <span className="username">{user.username}</span>
              <button onClick={logout} className="btn-secondary">
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
    </header>
  );
};

export default Header;
