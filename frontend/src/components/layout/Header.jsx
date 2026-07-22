import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl } from '../../utils/helpers';
import { Icon } from '../ui';
import NotificationBell from './NotificationBell';
import './Header.css';

const PRIMARY_NAV = [
  { to: '/',            label: 'Tonight',  icon: 'home',  end: true },
  { to: '/movies',      label: 'Archive',  icon: 'film' },
  { to: '/marathons',   label: 'Marathons', icon: 'calendar' },
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

    </header>
  );
};

export default Header;
