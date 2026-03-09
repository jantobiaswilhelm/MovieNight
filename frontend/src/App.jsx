import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Movie = lazy(() => import('./pages/Movie'));
const MoviesPage = lazy(() => import('./pages/MoviesPage'));
const Profile = lazy(() => import('./pages/Profile'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const Commands = lazy(() => import('./pages/Commands'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const MyMoviesPage = lazy(() => import('./pages/MyMoviesPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ActivityFeed = lazy(() => import('./pages/ActivityFeed'));

function App() {
  return (
    <NotificationProvider>
      <div className="app">
        <Header />
        <main className="container">
          <ErrorBoundary>
          <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
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
          </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="app-footer">
          <span>Made by Jan Wilhelm</span>
        </footer>
      </div>
    </NotificationProvider>
  );
}

export default App;
