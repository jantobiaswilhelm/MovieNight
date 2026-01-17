import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMovies, getActiveVoting, castVote, deleteSuggestion } from '../api/client';
import MovieCard from '../components/MovieCard';
import StarRating from '../components/StarRating';
import { MovieCardSkeleton } from '../components/Skeleton';
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

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="home">
      <div className="home-layout">
        {/* Left Side - Featured Movie */}
        <div className="home-hero-column">
          {loading ? (
            <div className="hero-backdrop hero-skeleton">
              <div className="hero-content">
                <div className="skeleton hero-poster-skeleton" />
                <div className="hero-details">
                  <div className="skeleton" style={{ width: '60%', height: 32 }} />
                  <div className="skeleton" style={{ width: '100%', height: 16, marginTop: 12 }} />
                  <div className="skeleton" style={{ width: '80%', height: 16, marginTop: 8 }} />
                </div>
              </div>
            </div>
          ) : nextMovie ? (
            <Link
              to={`/movie/${nextMovie.id}`}
              className="hero-backdrop"
              style={{
                backgroundImage: nextMovie.backdrop_url
                  ? `url(${nextMovie.backdrop_url})`
                  : nextMovie.image_url
                    ? `url(${nextMovie.image_url})`
                    : 'none'
              }}
            >
              <div className="hero-backdrop-overlay" />
              <div className="hero-content">
                <div className="hero-poster-small">
                  {nextMovie.image_url ? (
                    <img src={nextMovie.image_url} alt={nextMovie.title} className="hero-poster" />
                  ) : (
                    <div className="hero-poster-placeholder">No Poster</div>
                  )}
                </div>
                <div className="hero-details">
                  <span className="hero-badge">Up Next</span>
                  <h1 className="hero-title">{nextMovie.title}</h1>
                  {nextMovie.tagline && (
                    <p className="hero-tagline">"{nextMovie.tagline}"</p>
                  )}
                  <div className="hero-meta">
                    {nextMovie.release_year && (
                      <span className="hero-meta-item">{nextMovie.release_year}</span>
                    )}
                    {nextMovie.runtime && (
                      <span className="hero-meta-item">{Math.floor(nextMovie.runtime / 60)}h {nextMovie.runtime % 60}m</span>
                    )}
                    {nextMovie.tmdb_rating > 0 && (
                      <span className="hero-meta-item hero-tmdb">TMDB {parseFloat(nextMovie.tmdb_rating).toFixed(1)}</span>
                    )}
                  </div>
                  {nextMovie.genres && (
                    <div className="hero-genres">
                      {nextMovie.genres.split(', ').map((genre, i) => (
                        <span key={i} className="hero-genre-tag">{genre}</span>
                      ))}
                    </div>
                  )}
                  {nextMovie.description && (
                    <p className="hero-description">{nextMovie.description}</p>
                  )}
                  <div className="hero-footer">
                    <p className="hero-date">{formatDate(nextMovie.scheduled_at)}</p>
                    {nextMovie.announced_by_name && (
                      <p className="hero-picker">Picked by {nextMovie.announced_by_name}</p>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="hero-backdrop hero-empty">
              <div className="hero-backdrop-overlay" />
              <div className="hero-content">
                <div className="hero-details hero-details-centered">
                  <span className="hero-badge empty">No Upcoming</span>
                  <h2 className="hero-title">No movie scheduled</h2>
                  <p className="hero-description">Start a vote to pick the next movie!</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side - All Content */}
        <div className="home-content-column">
          {/* Voting Section */}
          {voting ? (
            <section className="home-section voting-section">
              <div className="section-header">
                <h2>Vote for Next Movie</h2>
                {voting.scheduled_at && (
                  <span className="voting-date">
                    {new Date(voting.scheduled_at).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
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
                            <img src={suggestion.image_url} alt="" className="suggestion-poster" />
                          )}
                          <div className="suggestion-info">
                            <span className="suggestion-title">{suggestion.title}</span>
                            <span className="suggestion-by">by {suggestion.suggested_by_name}</span>
                          </div>
                          <div className="suggestion-votes">
                            <div className="vote-bar-container">
                              <div className="vote-bar-fill" style={{ width: `${votePercent}%` }}></div>
                            </div>
                            <span className="vote-count">{suggestion.vote_count} votes</span>
                            {suggestion.voters && suggestion.voters.length > 0 && (
                              <div className="voter-avatars">
                                {suggestion.voters.slice(0, 5).map((voter) => (
                                  <img
                                    key={voter.discord_id}
                                    src={voter.avatar
                                      ? `https://cdn.discordapp.com/avatars/${voter.discord_id}/${voter.avatar}.png?size=32`
                                      : `https://cdn.discordapp.com/embed/avatars/${parseInt(voter.discord_id) % 5}.png`
                                    }
                                    alt={voter.username}
                                    title={voter.username}
                                    className="voter-avatar"
                                  />
                                ))}
                                {suggestion.voters.length > 5 && (
                                  <span className="voter-overflow">+{suggestion.voters.length - 5}</span>
                                )}
                              </div>
                            )}
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
                  <div className="empty-state compact">
                    <p>No suggestions yet! Use <code>/suggest</code> in Discord.</p>
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
          ) : !loading && (
            <section className="home-section voting-section">
              <div className="section-header">
                <h2>Vote for Next Movie</h2>
              </div>
              <div className="voting-placeholder">
                <div className="voting-card">
                  <div className="voting-icon">🗳️</div>
                  <h3>No Active Voting</h3>
                  <p>Use <code>/startvote</code> in Discord to start!</p>
                </div>
              </div>
            </section>
          )}

          {/* Bottom Row - Upcoming & Best Rated side by side */}
          <div className="home-bottom-row">
            <section className="home-section">
              <div className="section-header">
                <h2>Upcoming</h2>
                <Link to="/movies" className="view-all">All Movies →</Link>
              </div>
              {loading ? (
                <div className="upcoming-compact">
                  <MovieCardSkeleton />
                </div>
              ) : upcomingMovies.length <= 1 ? (
                <div className="empty-state compact">
                  <p>No more upcoming movies.</p>
                </div>
              ) : (
                <div className="upcoming-compact">
                  {upcomingMovies.slice(1, 4).map((movie) => (
                    <MovieCard key={movie.id} movie={movie} variant="compact" />
                  ))}
                </div>
              )}
            </section>

            <section className="home-section">
              <div className="section-header">
                <h2>Best This Month</h2>
                <Link to="/movies" className="view-all">Stats →</Link>
              </div>
              {loading ? (
                <div className="best-rated-list compact">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="best-rated-item best-rated-skeleton">
                      <div className="skeleton" style={{ width: 30, height: 20 }} />
                      <div className="skeleton" style={{ width: 30, height: 45 }} />
                      <div className="best-rated-info">
                        <div className="skeleton" style={{ width: 100, height: 16 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : bestRatedThisMonth.length === 0 ? (
                <div className="empty-state compact">
                  <p>No rated movies yet.</p>
                </div>
              ) : (
                <div className="best-rated-list compact">
                  {bestRatedThisMonth.slice(0, 4).map((movie, index) => (
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
        </div>
      </div>
    </div>
  );
};

export default Home;
