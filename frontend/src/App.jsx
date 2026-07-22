import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/layout';
import { ErrorBoundary } from './components/common';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Movie = lazy(() => import('./pages/Movie'));
const MoviesPage = lazy(() => import('./pages/MoviesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const Commands = lazy(() => import('./pages/Commands'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const MyMoviesPage = lazy(() => import('./pages/MyMoviesPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ActivityFeed = lazy(() => import('./pages/ActivityFeed'));
const MarathonsPage = lazy(() => import('./pages/MarathonsPage'));

function App() {
  return (
    <NotificationProvider>
      <ToastProvider>
      <ConfirmProvider>
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
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/my-movies" element={<MyMoviesPage />} />
            <Route path="/user/:userId" element={<ProfilePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:name" element={<CollectionsPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/lists/:id" element={<ListsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/feed" element={<ActivityFeed />} />
            <Route path="/marathons" element={<MarathonsPage />} />
            <Route path="/marathons/:id" element={<MarathonsPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="app-footer">
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>MovieNight · Est. MMXXIV</span>
            <span>Made by Jan Wilhelm</span>
          </div>
        </footer>
      </div>
      </ConfirmProvider>
      </ToastProvider>
    </NotificationProvider>
  );
}

export default App;
