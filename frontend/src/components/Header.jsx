import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeSwitcher from './ThemeSwitcher';
import NotificationBell from './NotificationBell';
import './Header.css';

const Header = () => {
  const { user, login, logout, isAuthenticated } = useAuth();

  const getAvatarUrl = () => {
    if (!user?.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
  };

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          OnlyFans Movie Night
        </Link>

        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/movies">Movies</Link>
          <Link to="/wishlist">Wishlist</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/lists">Lists</Link>
          <Link to="/stats">Stats</Link>
          {isAuthenticated && <Link to="/feed">Feed</Link>}
          {isAuthenticated && <Link to="/achievements">Achievements</Link>}
          {isAuthenticated && <Link to="/my-movies">My Movies</Link>}
          {isAuthenticated && <Link to="/profile">My Profile</Link>}
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
