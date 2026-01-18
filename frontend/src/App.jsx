import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Movie from './pages/Movie';
import MoviesPage from './pages/MoviesPage';
import Profile from './pages/Profile';
import StatsPage from './pages/StatsPage';
import Commands from './pages/Commands';
import WishlistPage from './pages/WishlistPage';
import AuthCallback from './pages/AuthCallback';
import './App.css';

function App() {
  return (
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
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <span>Made by Jan Wilhelm</span>
      </footer>
    </div>
  );
}

export default App;
