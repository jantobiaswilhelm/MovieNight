import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Movie from './pages/Movie';
import Profile from './pages/Profile';
import StatsPage from './pages/StatsPage';
import Calendar from './pages/Calendar';
import Commands from './pages/Commands';
import AuthCallback from './pages/AuthCallback';
import './App.css';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movie/:id" element={<Movie />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/commands" element={<Commands />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
