import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Movie from './pages/Movie';
import MoviesPage from './pages/MoviesPage';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import StatsPage from './pages/StatsPage';
import Commands from './pages/Commands';
import WishlistPage from './pages/WishlistPage';
import MyMoviesPage from './pages/MyMoviesPage';
import AuthCallback from './pages/AuthCallback';
import CollectionsPage from './pages/CollectionsPage';
import ListsPage from './pages/ListsPage';
import AchievementsPage from './pages/AchievementsPage';
import ActivityFeed from './pages/ActivityFeed';
import { NotificationProvider } from './context/NotificationContext';
import './App.css';

function App() {
  return (
    <NotificationProvider>
      <div className="app">
        <Header />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/movie/:id" element={<Movie />} />
            <Route path="/commands" element={<Commands />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-movies" element={<MyMoviesPage />} />
            <Route path="/user/:userId" element={<UserProfile />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:name" element={<CollectionsPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/lists/:id" element={<ListsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/feed" element={<ActivityFeed />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Made by Jan Wilhelm</span>
        </footer>
      </div>
    </NotificationProvider>
  );
}

export default App;
