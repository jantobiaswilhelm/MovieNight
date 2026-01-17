import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovies, getActiveVoting, castVote, deleteSuggestion } from '../api/client';
import Hero from '../components/Hero';
import MovieCard from '../components/MovieCard';
import StarRating from '../components/StarRating';
import { HeroSkeleton, MovieCardSkeleton } from '../components/Skeleton';
import './Home.css';

const Home = () => {
  const { isAuthenticated, isAdmin, login } = useAuth();
  const [movies, setMovies] = useState([]);
  const [voting, setVoting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [votingLoading, setVotingLoading] = useState(false);
  const [deletingSuggestion, setDeletingSuggestion] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [moviesData, votingData] = await Promise.all([
          getMovies(100, 0),
          getActiveVoting().catch(() => null)
        ]);
        setMovies(moviesData);
        setVoting(votingData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleVote = async (suggestionId) => {
    if (!isAuthenticated) return;

    setVotingLoading(true);
    try {
      await castVote(suggestionId);
      // Refresh voting data
      const votingData = await getActiveVoting();
      setVoting(votingData);
    } catch (err) {
      console.error('Error voting:', err);
    } finally {
      setVotingLoading(false);
    }
  };

  const handleDeleteSuggestion = async (e, suggestionId, suggestionTitle) => {
    e.stopPropagation();

    if (!confirm(`Delete suggestion "${suggestionTitle}"?`)) {
      return;
    }

    setDeletingSuggestion(suggestionId);
    try {
      await deleteSuggestion(suggestionId);
      // Refresh voting data
      const votingData = await getActiveVoting();
      setVoting(votingData);
    } catch (err) {
      console.error('Error deleting suggestion:', err);
      alert('Failed to delete suggestion');
    } finally {
      setDeletingSuggestion(null);
    }
  };

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Upcoming movies (scheduled in the future)
  const upcomingMovies = movies
    .filter(movie => new Date(movie.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Best rated movies of this month
  const bestRatedThisMonth = movies
    .filter(movie => {
      const date = new Date(movie.scheduled_at);
      return date >= startOfMonth && date <= endOfMonth && parseFloat(movie.avg_rating) > 0;
    })
    .sort((a, b) => parseFloat(b.avg_rating) - parseFloat(a.avg_rating))
    .slice(0, 5);

  // Calculate total votes for percentage
  const totalVotes = voting?.suggestions?.reduce((sum, s) => sum + parseInt(s.vote_count), 0) || 0;

  // Get the next upcoming movie for the hero
  const nextMovie = upcomingMovies[0];

  return (
    <div className="home">
      {/* Hero Section */}
      {loading ? (
        <HeroSkeleton />
      ) : nextMovie ? (
        <Hero movie={nextMovie} type="upcoming" />
      ) : null}

      {/* Active Voting Section */}
      {voting && (
        <section className="home-section voting-section">
          <div className="section-header">
            <h2>Vote for Next Movie</h2>
            {voting.scheduled_at && (
              <span className="voting-date">
                Planned: {new Date(voting.scheduled_at).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            )}
          </div>

          <div className="voting-active">
            {voting.suggestions && voting.suggestions.length > 0 ? (
              <div className="suggestions-list">
                {voting.suggestions.map((suggestion) => {
                  const votePercent = totalVotes > 0
                    ? Math.round((parseInt(suggestion.vote_count) / totalVotes) * 100)
                    : 0;
                  const isUserVote = voting.user_vote?.suggestion_id === suggestion.id;

                  return (
                    <div
                      key={suggestion.id}
                      className={`suggestion-item ${isUserVote ? 'voted' : ''}`}
                      onClick={() => !votingLoading && isAuthenticated && handleVote(suggestion.id)}
                    >
                      {suggestion.image_url && (
                        <img
                          src={suggestion.image_url}
                          alt=""
                          className="suggestion-poster"
                        />
                      )}
                      <div className="suggestion-info">
                        <span className="suggestion-title">{suggestion.title}</span>
                        <span className="suggestion-by">by {suggestion.suggested_by_name}</span>
                      </div>
                      <div className="suggestion-votes">
                        <div className="vote-bar-container">
                          <div
                            className="vote-bar-fill"
                            style={{ width: `${votePercent}%` }}
                          ></div>
                        </div>
                        <span className="vote-count">{suggestion.vote_count} votes</span>
                      </div>
                      {isUserVote && <span className="your-vote">Your vote</span>}
                      {isAdmin && (
                        <button
                          className="suggestion-delete-btn"
                          onClick={(e) => handleDeleteSuggestion(e, suggestion.id, suggestion.title)}
                          disabled={deletingSuggestion === suggestion.id}
                          title="Delete suggestion"
                        >
                          {deletingSuggestion === suggestion.id ? '...' : '×'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <p>No suggestions yet!</p>
                <p>Use <code>/suggest</code> in Discord to add movies.</p>
              </div>
            )}

            {!isAuthenticated && voting.suggestions?.length > 0 && (
              <div className="login-to-vote">
                <p>Log in to vote!</p>
                <button onClick={login} className="btn-primary">Login with Discord</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* No Active Voting */}
      {!loading && !voting && (
        <section className="home-section voting-section">
          <div className="section-header">
            <h2>Vote for Next Movie</h2>
          </div>
          <div className="voting-placeholder">
            <div className="voting-card">
              <div className="voting-icon">🗳️</div>
              <h3>No Active Voting</h3>
              <p>Use <code>/startvote</code> in Discord to start a new voting session!</p>
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Movies Section */}
      <section className="home-section">
        <div className="section-header">
          <h2>Upcoming Movie Nights</h2>
          <Link to="/calendar" className="view-all">View Calendar →</Link>
        </div>

        {loading ? (
          <div className="movie-grid horizontal">
            <MovieCardSkeleton />
            <MovieCardSkeleton />
            <MovieCardSkeleton />
          </div>
        ) : upcomingMovies.length === 0 ? (
          <div className="empty-state">
            <p>No upcoming movie nights scheduled.</p>
            <p>Use <code>/announce</code> in Discord to create one.</p>
          </div>
        ) : (
          <div className="movie-grid horizontal">
            {upcomingMovies.slice(1, 4).map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </section>

      {/* Best Rated This Month Section */}
      <section className="home-section">
        <div className="section-header">
          <h2>Best Rated This Month</h2>
          <Link to="/stats" className="view-all">View Stats →</Link>
        </div>

        {loading ? (
          <div className="best-rated-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="best-rated-item best-rated-skeleton">
                <div className="skeleton" style={{ width: 40, height: 24 }} />
                <div className="skeleton" style={{ width: 40, height: 60 }} />
                <div className="best-rated-info">
                  <div className="skeleton" style={{ width: 150, height: 20 }} />
                  <div className="skeleton" style={{ width: 80, height: 16 }} />
                </div>
              </div>
            ))}
          </div>
        ) : bestRatedThisMonth.length === 0 ? (
          <div className="empty-state">
            <p>No rated movies this month yet.</p>
          </div>
        ) : (
          <div className="best-rated-list">
            {bestRatedThisMonth.map((movie, index) => (
              <Link to={`/movie/${movie.id}`} key={movie.id} className="best-rated-item">
                <span className="rank">#{index + 1}</span>
                {movie.image_url && (
                  <img src={movie.image_url} alt="" className="best-rated-poster" />
                )}
                <div className="best-rated-info">
                  <span className="best-rated-title">{movie.title}</span>
                  <StarRating rating={parseFloat(movie.avg_rating)} size="small" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
