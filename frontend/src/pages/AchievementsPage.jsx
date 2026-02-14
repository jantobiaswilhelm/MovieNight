import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyAchievements } from '../api/client';
import './AchievementsPage.css';

const ICONS = {
  star: String.fromCodePoint(0x2B50),
  film: String.fromCodePoint(0x1F3AC),
  trophy: String.fromCodePoint(0x1F3C6),
  award: String.fromCodePoint(0x1F3C5),
  flame: String.fromCodePoint(0x1F525),
  zap: String.fromCodePoint(0x26A1),
  'thumbs-down': String.fromCodePoint(0x1F44E),
  'thumbs-up': String.fromCodePoint(0x1F44D),
  clock: String.fromCodePoint(0x23F0),
  folder: String.fromCodePoint(0x1F4C1),
  'check-circle': String.fromCodePoint(0x2705),
  rocket: String.fromCodePoint(0x1F680),
  moon: String.fromCodePoint(0x1F319),
  default: String.fromCodePoint(0x1F3AF)
};

const CATEGORY_ORDER = ['ratings', 'streaks', 'watchtime', 'collections', 'special'];

const AchievementsPage = () => {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAchievements();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchAchievements = async () => {
    try {
      const result = await getMyAchievements();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading achievements...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="achievements-page">
        <h1>Achievements</h1>
        <div className="empty-state">
          <p>Log in to view your achievements.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const achievements = data?.achievements || [];
  const progress = data?.progress || {};

  // Group achievements by category
  const grouped = {};
  for (const achievement of achievements) {
    const cat = achievement.category || 'special';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(achievement);
  }

  const unlockedCount = achievements.filter((a) => a.unlocked_at).length;
  const totalPoints = achievements
    .filter((a) => a.unlocked_at)
    .reduce((sum, a) => sum + a.points, 0);

  const formatCategory = (cat) => {
    const names = {
      ratings: 'Rating Achievements',
      streaks: 'Streak Achievements',
      watchtime: 'Watchtime Achievements',
      collections: 'Collection Achievements',
      special: 'Special Achievements'
    };
    return names[cat] || cat;
  };

  return (
    <div className="achievements-page">
      <h1>Achievements</h1>

      {/* Progress Summary */}
      <div className="achievements-summary">
        <div className="summary-stat">
          <span className="summary-value">{unlockedCount}/{achievements.filter(a => !a.is_hidden || a.unlocked_at).length}</span>
          <span className="summary-label">Unlocked</span>
        </div>
        <div className="summary-stat">
          <span className="summary-value">{totalPoints}</span>
          <span className="summary-label">Points</span>
        </div>
        {progress.current_streak > 0 && (
          <div className="summary-stat">
            <span className="summary-value">{String.fromCodePoint(0x1F525)} {progress.current_streak}</span>
            <span className="summary-label">Current Streak</span>
          </div>
        )}
      </div>

      {/* Current Progress */}
      <div className="progress-section">
        <h2>Current Progress</h2>
        <div className="progress-grid">
          <div className="progress-item">
            <span className="progress-value">{progress.rating_count || 0}</span>
            <span className="progress-label">Movies Rated</span>
          </div>
          <div className="progress-item">
            <span className="progress-value">{progress.longest_streak || 0}</span>
            <span className="progress-label">Best Streak</span>
          </div>
          <div className="progress-item">
            <span className="progress-value">{Math.floor((progress.watchtime_minutes || 0) / 60)}h</span>
            <span className="progress-label">Watch Time</span>
          </div>
          <div className="progress-item">
            <span className="progress-value">{progress.hot_take_count || 0}</span>
            <span className="progress-label">Hot Takes</span>
          </div>
        </div>
      </div>

      {/* Achievement Categories */}
      {CATEGORY_ORDER.map((cat) => {
        const catAchievements = grouped[cat];
        if (!catAchievements || catAchievements.length === 0) return null;

        // Filter out hidden achievements that aren't unlocked
        const visible = catAchievements.filter((a) => !a.is_hidden || a.unlocked_at);
        if (visible.length === 0) return null;

        return (
          <section key={cat} className="achievements-category">
            <h2>{formatCategory(cat)}</h2>
            <div className="achievements-grid">
              {visible.map((achievement) => (
                <div
                  key={achievement.code}
                  className={`achievement-card ${achievement.unlocked_at ? 'unlocked' : 'locked'}`}
                >
                  <div className="achievement-icon">
                    {ICONS[achievement.icon] || ICONS.default}
                  </div>
                  <div className="achievement-info">
                    <h3>{achievement.name}</h3>
                    <p>{achievement.description}</p>
                    <div className="achievement-meta">
                      <span className="achievement-points">{achievement.points} pts</span>
                      {achievement.unlocked_at && (
                        <span className="achievement-date">
                          {new Date(achievement.unlocked_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {achievement.unlocked_at && (
                    <div className="achievement-badge">&#x2714;</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default AchievementsPage;
