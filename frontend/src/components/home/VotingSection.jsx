import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { getAvatarUrl } from '../../utils/helpers';
import {
  getActiveVoting,
  castVote,
  deleteSuggestion,
  createVotingSession,
  closeVotingSession,
  deleteVotingSession,
  submitSuggestion,
  searchTMDB,
  getTMDBMovie
} from '../../api/client';

/** Format a Date as YYYY-MM-DD in the browser's local timezone (never UTC). */
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const VotingSection = ({ voting, setVoting, loading, onDataRefresh }) => {
  const { isAuthenticated, isAdmin, login } = useAuth();
  const { showError } = useToast();
  const confirm = useConfirm();

  // Voting management state
  const [showStartVoteModal, setShowStartVoteModal] = useState(false);
  const [showAddMovieModal, setShowAddMovieModal] = useState(false);
  const [voteDate, setVoteDate] = useState(localDateStr(new Date()));
  const [voteTime, setVoteTime] = useState('20:00');
  const [creatingVote, setCreatingVote] = useState(false);
  const [endingVote, setEndingVote] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [votingLoading, setVotingLoading] = useState(false);
  const [deletingSuggestion, setDeletingSuggestion] = useState(null);

  // Movie search state
  const [movieSearch, setMovieSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingMovie, setAddingMovie] = useState(null);

  // Vote result state
  const [voteResult, setVoteResult] = useState(null);
  const [showVoteResultModal, setShowVoteResultModal] = useState(false);

  const totalVotes = voting?.suggestions?.reduce((sum, s) => sum + parseInt(s.vote_count), 0) || 0;

  const handleVote = async (suggestionId) => {
    if (!isAuthenticated) return;

    setVotingLoading(true);
    try {
      await castVote(suggestionId);
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
    if (!(await confirm({
      title: 'Delete suggestion?',
      message: `Remove "${suggestionTitle}" from the vote?`,
      confirmLabel: 'Delete',
      danger: true
    }))) return;

    setDeletingSuggestion(suggestionId);
    try {
      await deleteSuggestion(suggestionId);
      const votingData = await getActiveVoting();
      setVoting(votingData);
    } catch (err) {
      console.error('Error deleting suggestion:', err);
      showError('Failed to delete suggestion');
    } finally {
      setDeletingSuggestion(null);
    }
  };

  const handleStartVote = async (e) => {
    e.preventDefault();
    if (!voteDate) {
      showError('Please select a date');
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
      showError('Failed to create vote: ' + err.message);
    } finally {
      setCreatingVote(false);
    }
  };

  const handleEndVote = async () => {
    if (!voting) return;

    setEndingVote(true);
    setConfirmAction(null);
    try {
      const result = await closeVotingSession(voting.id, true);

      if (result.winner) {
        setVoteResult(result);
        setShowVoteResultModal(true);
      }

      const votingData = await getActiveVoting().catch(() => null);
      setVoting(votingData);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      console.error('Error ending vote:', err);
      setConfirmAction(null);
    } finally {
      setEndingVote(false);
    }
  };

  const handleCancelVote = async () => {
    if (!voting) return;

    setEndingVote(true);
    setConfirmAction(null);
    try {
      await deleteVotingSession(voting.id);
      setVoting(null);
    } catch (err) {
      console.error('Error canceling vote:', err);
      showError('Failed to cancel vote: ' + err.message);
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
      showError('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleAddMovieToVote = async (movie) => {
    if (!voting) return;

    setAddingMovie(movie.id);
    try {
      const details = await getTMDBMovie(movie.id);
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

      const votingData = await getActiveVoting();
      setVoting(votingData);
      setShowAddMovieModal(false);
      setMovieSearch('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error adding movie:', err);
      showError('Failed to add movie: ' + err.message);
    } finally {
      setAddingMovie(null);
    }
  };

  if (loading) return null;

  return (
    <>
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
              {isAdmin && !confirmAction && (
                <>
                  <button
                    className="btn-primary btn-small"
                    onClick={() => setConfirmAction('end')}
                    disabled={endingVote}
                  >
                    {endingVote ? 'Ending...' : 'End Vote'}
                  </button>
                  <button
                    className="btn-danger btn-small"
                    onClick={() => setConfirmAction('cancel')}
                    disabled={endingVote}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Inline Confirmation */}
          {confirmAction && (
            <div className="vote-confirm-inline">
              <span className="confirm-message">
                {confirmAction === 'end'
                  ? 'End voting and schedule the winning movie?'
                  : 'Cancel voting? This will delete all suggestions.'}
              </span>
              <div className="confirm-actions">
                <button
                  className="btn-secondary btn-small"
                  onClick={() => setConfirmAction(null)}
                  disabled={endingVote}
                >
                  No, go back
                </button>
                <button
                  className={`btn-small ${confirmAction === 'end' ? 'btn-primary' : 'btn-danger'}`}
                  onClick={confirmAction === 'end' ? handleEndVote : handleCancelVote}
                  disabled={endingVote}
                >
                  {endingVote ? 'Processing...' : confirmAction === 'end' ? 'Yes, end vote' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          )}

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
                        <img src={suggestion.image_url} alt={suggestion.title} className="suggestion-poster" loading="lazy" />
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
                                src={getAvatarUrl(voter.discord_id, voter.avatar)}
                                alt={voter.username}
                                title={voter.username}
                                className="voter-avatar"
                                loading="lazy"
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
                          {deletingSuggestion === suggestion.id ? '...' : '\u00D7'}
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
      ) : (
        <section className="home-section voting-section">
          <div className="section-header">
            <h2>Vote for Next Movie</h2>
            {isAdmin && !showStartVoteModal && (
              <button
                className="btn-primary btn-small"
                onClick={() => setShowStartVoteModal(true)}
              >
                Start Vote
              </button>
            )}
          </div>
          {showStartVoteModal ? (
            <div className="voting-inline-form">
              <h3>Start New Vote</h3>
              <p className="inline-form-description">Set the movie night date and time</p>
              <form onSubmit={handleStartVote}>
                <div className="inline-form-row">
                  <div className="inline-form-field">
                    <label>Date</label>
                    <input
                      type="date"
                      value={voteDate}
                      onChange={(e) => setVoteDate(e.target.value)}
                      min={localDateStr(new Date())}
                      required
                    />
                  </div>
                  <div className="inline-form-field">
                    <label>Time</label>
                    <input
                      type="time"
                      value={voteTime}
                      onChange={(e) => setVoteTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="inline-form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowStartVoteModal(false);
                      setVoteDate('');
                      setVoteTime('20:00');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={creatingVote}>
                    {creatingVote ? 'Creating...' : 'Start Vote'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="voting-placeholder">
              <div className="voting-card">
                <div className="voting-icon">{'\uD83D\uDDF3\uFE0F'}</div>
                <h3>No Active Voting</h3>
                {isAdmin ? (
                  <p>Click "Start Vote" to begin a new voting session.</p>
                ) : (
                  <p>Check back soon for the next vote!</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Add Movie Modal */}
      {showAddMovieModal && (
        <div className="modal-overlay" onClick={() => setShowAddMovieModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Movie to Vote</h2>
              <button className="modal-close" onClick={() => setShowAddMovieModal(false)}>{'\u00D7'}</button>
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
                      <img src={movie.posterPath} alt={movie.title} className="result-poster" loading="lazy" />
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
              <button className="modal-close" onClick={() => setShowVoteResultModal(false)}>{'\u00D7'}</button>
            </div>
            <div className="vote-result-content">
              <div className="vote-result-trophy">{'\uD83C\uDFC6'}</div>
              <h3 className="vote-result-label">The Winner Is</h3>
              <div className="vote-result-winner">
                {voteResult.winner.image_url && (
                  <img
                    src={voteResult.winner.image_url}
                    alt={voteResult.winner.title}
                    className="vote-result-poster"
                    loading="lazy"
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
    </>
  );
};

export default VotingSection;
