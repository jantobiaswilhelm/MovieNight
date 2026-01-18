import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMovies,
  getActiveVoting,
  castVote,
  deleteSuggestion,
  createVotingSession,
  closeVotingSession,
  deleteVotingSession,
  submitSuggestion,
  searchTMDB,
  getTMDBMovie,
  getNextMovieWithAttendees,
  getUpcomingMoviesWithAttendees,
  toggleAttendance
} from '../api/client';
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

  // Voting management state
  const [showStartVoteModal, setShowStartVoteModal] = useState(false);
  const [showAddMovieModal, setShowAddMovieModal] = useState(false);
  const [voteDate, setVoteDate] = useState('');
  const [voteTime, setVoteTime] = useState('20:00');
  const [creatingVote, setCreatingVote] = useState(false);
  const [endingVote, setEndingVote] = useState(false);

  // Movie search state
  const [movieSearch, setMovieSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingMovie, setAddingMovie] = useState(null);

  // Vote result state
  const [voteResult, setVoteResult] = useState(null);
  const [showVoteResultModal, setShowVoteResultModal] = useState(false);

  // Next movie with attendees
  const [nextMovieWithAttendees, setNextMovieWithAttendees] = useState(null);
  const [upcomingWithAttendees, setUpcomingWithAttendees] = useState([]);
  const [togglingAttendance, setTogglingAttendance] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [moviesData, votingData, nextMovieData, upcomingData] = await Promise.all([
          getMovies(100, 0),
          getActiveVoting().catch(() => null),
          getNextMovieWithAttendees().catch(() => null),
          getUpcomingMoviesWithAttendees(5).catch(() => [])
        ]);
        setMovies(moviesData);
        setVoting(votingData);
        setNextMovieWithAttendees(nextMovieData);
        setUpcomingWithAttendees(upcomingData);
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

  const handleStartVote = async (e) => {
    e.preventDefault();
    if (!voteDate) {
      alert('Please select a date');
      return;
    }

    setCreatingVote(true);
    try {
      const scheduledAt = new Date(`${voteDate}T${voteTime}`);
      await createVotingSession(scheduledAt.toISOString());
      const votingData = await getActiveVoting();
      setVoting(votingData);
      setShowStartVoteModal(false);
      setVoteDate('');
      setVoteTime('20:00');
    } catch (err) {
      console.error('Error creating vote:', err);
      alert('Failed to create vote: ' + err.message);
    } finally {
      setCreatingVote(false);
    }
  };

  const handleEndVote = async () => {
    if (!voting) return;
    if (!confirm('End voting and schedule the winning movie?')) return;

    setEndingVote(true);
    try {
      const result = await closeVotingSession(voting.id, true);

      // Show the result modal with winner info
      if (result.winner) {
        setVoteResult(result);
        setShowVoteResultModal(true);
      }

      // Refresh all data
      const [votingData, moviesData, nextMovieData, upcomingData] = await Promise.all([
        getActiveVoting().catch(() => null),
        getMovies(100, 0),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => [])
      ]);

      setVoting(votingData);
      setMovies(moviesData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
    } catch (err) {
      console.error('Error ending vote:', err);
      alert('Failed to end vote: ' + err.message);
    } finally {
      setEndingVote(false);
    }
  };

  const handleCancelVote = async () => {
    if (!voting) return;
    if (!confirm('Cancel voting? This will delete all suggestions and votes.')) return;

    setEndingVote(true);
    try {
      await deleteVotingSession(voting.id);
      setVoting(null);
    } catch (err) {
      console.error('Error canceling vote:', err);
      alert('Failed to cancel vote: ' + err.message);
    } finally {
      setEndingVote(false);
    }
  };

  const handleSearchMovies = async (e) => {
    e.preventDefault();
    if (!movieSearch.trim()) return;

    setSearching(true);
    try {
      const results = await searchTMDB(movieSearch);
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching movies:', err);
      alert('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleToggleAttendance = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || !nextMovieWithAttendees) return;

    setTogglingAttendance(true);
    try {
      const result = await toggleAttendance(nextMovieWithAttendees.id);
      setNextMovieWithAttendees(prev => ({
        ...prev,
        attendees: result.attendees,
        is_attending: result.attending
      }));
    } catch (err) {
      console.error('Error toggling attendance:', err);
    } finally {
      setTogglingAttendance(false);
    }
  };

  const handleAddMovieToVote = async (movie) => {
    if (!voting) return;

    setAddingMovie(movie.id);
    try {
      // Get full movie details
      const details = await getTMDBMovie(movie.id);

      // Submit suggestion with TMDB data
      await submitSuggestion(voting.id, details.title, details.posterPath, {
        description: details.overview,
        tmdbId: details.id,
        tmdbRating: details.rating,
        genres: details.genres,
        runtime: details.runtime,
        releaseYear: details.year,
        backdropUrl: details.backdropPath,
        tagline: details.tagline,
        imdbId: details.imdbId,
        originalLanguage: details.originalLanguage,
        collectionName: details.collectionName,
        trailerUrl: details.trailerUrl
      });

      // Refresh voting data
      const votingData = await getActiveVoting();
      setVoting(votingData);
      setShowAddMovieModal(false);
      setMovieSearch('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error adding movie:', err);
      alert('Failed to add movie: ' + err.message);
    } finally {
      setAddingMovie(null);
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

  // Get the next upcoming movie for the hero (use the one with attendees if available)
  const nextMovie = nextMovieWithAttendees || upcomingMovies[0];

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
                  {/* Attendance Section */}
                  <div className="hero-attendance">
                    <div className="attendance-info">
                      {nextMovie.attendees && nextMovie.attendees.length > 0 ? (
                        <>
                          <div className="attendance-avatars">
                            {nextMovie.attendees.slice(0, 8).map((attendee) => (
                              <img
                                key={attendee.discord_id}
                                src={attendee.avatar
                                  ? `https://cdn.discordapp.com/avatars/${attendee.discord_id}/${attendee.avatar}.png?size=32`
                                  : `https://cdn.discordapp.com/embed/avatars/${parseInt(attendee.discord_id) % 5}.png`
                                }
                                alt={attendee.username}
                                title={attendee.username}
                                className="attendance-avatar"
                              />
                            ))}
                            {nextMovie.attendees.length > 8 && (
                              <span className="attendance-overflow">+{nextMovie.attendees.length - 8}</span>
                            )}
                          </div>
                          <span className="attendance-count">
                            {nextMovie.attendees.length} attending
                          </span>
                        </>
                      ) : (
                        <span className="attendance-count">No one attending yet</span>
                      )}
                    </div>
                    {isAuthenticated && (
                      <button
                        className={`hero-btn ${nextMovie.is_attending ? 'hero-btn-attending' : 'hero-btn-attend'}`}
                        onClick={handleToggleAttendance}
                        disabled={togglingAttendance}
                      >
                        {togglingAttendance ? '...' : nextMovie.is_attending ? '✓ Attending' : '+ Attend'}
                      </button>
                    )}
                  </div>
                  {(nextMovie.trailer_url || nextMovie.imdb_id) && (
                    <div className="hero-actions">
                      {nextMovie.trailer_url && (
                        <a
                          href={nextMovie.trailer_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hero-btn hero-btn-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ▶ Watch Trailer
                        </a>
                      )}
                      {nextMovie.imdb_id && (
                        <a
                          href={`https://www.imdb.com/title/${nextMovie.imdb_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hero-btn hero-btn-secondary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          IMDb
                        </a>
                      )}
                    </div>
                  )}
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
                <div className="voting-header-actions">
                  {voting.scheduled_at && (
                    <span className="voting-date">
                      {new Date(voting.scheduled_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  )}
                  {isAuthenticated && (
                    <button
                      className="btn-secondary btn-small"
                      onClick={() => setShowAddMovieModal(true)}
                    >
                      + Add Movie
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        className="btn-primary btn-small"
                        onClick={handleEndVote}
                        disabled={endingVote}
                      >
                        {endingVote ? 'Ending...' : 'End Vote'}
                      </button>
                      <button
                        className="btn-danger btn-small"
                        onClick={handleCancelVote}
                        disabled={endingVote}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
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
                    <p>No suggestions yet!</p>
                    {isAuthenticated && (
                      <button
                        className="btn-primary"
                        onClick={() => setShowAddMovieModal(true)}
                        style={{ marginTop: '1rem' }}
                      >
                        + Add First Movie
                      </button>
                    )}
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
                {isAdmin && (
                  <button
                    className="btn-primary btn-small"
                    onClick={() => setShowStartVoteModal(true)}
                  >
                    Start Vote
                  </button>
                )}
              </div>
              <div className="voting-placeholder">
                <div className="voting-card">
                  <div className="voting-icon">🗳️</div>
                  <h3>No Active Voting</h3>
                  {isAdmin ? (
                    <p>Click "Start Vote" to begin a new voting session.</p>
                  ) : (
                    <p>Check back soon for the next vote!</p>
                  )}
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
              ) : upcomingWithAttendees.length <= 1 ? (
                <div className="empty-state compact">
                  <p>No more upcoming movies.</p>
                </div>
              ) : (
                <div className="upcoming-compact">
                  {upcomingWithAttendees.slice(1, 4).map((movie) => (
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

      {/* Start Vote Modal */}
      {showStartVoteModal && (
        <div className="modal-overlay" onClick={() => setShowStartVoteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Start New Vote</h2>
              <button className="modal-close" onClick={() => setShowStartVoteModal(false)}>×</button>
            </div>
            <form onSubmit={handleStartVote}>
              <div className="form-group">
                <label>Movie Night Date</label>
                <input
                  type="date"
                  value={voteDate}
                  onChange={(e) => setVoteDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input
                  type="time"
                  value={voteTime}
                  onChange={(e) => setVoteTime(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowStartVoteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creatingVote}>
                  {creatingVote ? 'Creating...' : 'Start Vote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Movie Modal */}
      {showAddMovieModal && (
        <div className="modal-overlay" onClick={() => setShowAddMovieModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Movie to Vote</h2>
              <button className="modal-close" onClick={() => setShowAddMovieModal(false)}>×</button>
            </div>
            <form onSubmit={handleSearchMovies} className="search-form">
              <input
                type="text"
                placeholder="Search for a movie..."
                value={movieSearch}
                onChange={(e) => setMovieSearch(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-primary" disabled={searching}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((movie) => (
                  <div
                    key={movie.id}
                    className="search-result-item"
                    onClick={() => handleAddMovieToVote(movie)}
                  >
                    {movie.posterPath ? (
                      <img src={movie.posterPath} alt="" className="result-poster" />
                    ) : (
                      <div className="result-poster no-poster">No Image</div>
                    )}
                    <div className="result-info">
                      <span className="result-title">{movie.title}</span>
                      <span className="result-year">{movie.year}</span>
                      {movie.rating && (
                        <span className="result-rating">TMDB: {movie.rating}</span>
                      )}
                    </div>
                    <button
                      className="btn-primary btn-small"
                      disabled={addingMovie === movie.id}
                    >
                      {addingMovie === movie.id ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vote Result Modal */}
      {showVoteResultModal && voteResult && (
        <div className="modal-overlay" onClick={() => setShowVoteResultModal(false)}>
          <div className="modal-content vote-result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Voting Complete!</h2>
              <button className="modal-close" onClick={() => setShowVoteResultModal(false)}>×</button>
            </div>
            <div className="vote-result-content">
              <div className="vote-result-trophy">🏆</div>
              <h3 className="vote-result-label">The Winner Is</h3>
              <div className="vote-result-winner">
                {voteResult.winner.image_url && (
                  <img
                    src={voteResult.winner.image_url}
                    alt={voteResult.winner.title}
                    className="vote-result-poster"
                  />
                )}
                <div className="vote-result-info">
                  <h2 className="vote-result-title">{voteResult.winner.title}</h2>
                  {voteResult.winner.release_year && (
                    <span className="vote-result-year">{voteResult.winner.release_year}</span>
                  )}
                  <span className="vote-result-votes">
                    {voteResult.winner.vote_count} votes
                  </span>
                  <span className="vote-result-suggested">
                    Suggested by {voteResult.winner.suggested_by_name}
                  </span>
                </div>
              </div>
              {voteResult.movie_created && (
                <p className="vote-result-scheduled">
                  Movie night has been scheduled!
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => setShowVoteResultModal(false)}
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
