import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyAchievements } from '../api/client';
import { useFetch } from '../hooks';
import { Icon, PageHeader, SectionHead, Stat, EmptyState } from '../components/ui';
import './AchievementsPage.css';

const ICON_MAP = {
  star: 'star',
  film: 'film',
  trophy: 'trophy',
  award: 'trophy',
  flame: 'star',
  zap: 'star',
  'thumbs-down': 'close',
  'thumbs-up': 'check',
  clock: 'clock',
  folder: 'folder',
  'check-circle': 'check',
  rocket: 'play',
  moon: 'star',
  default: 'trophy'
};

const CATEGORY_ORDER = ['ratings', 'streaks', 'watchtime', 'collections', 'special'];

const CATEGORY_META = {
  ratings:     { num: '02', label: 'Ratings' },
  streaks:     { num: '03', label: 'Streaks' },
  watchtime:   { num: '04', label: 'Watchtime' },
  collections: { num: '05', label: 'Collections' },
  special:     { num: '06', label: 'Special' },
};

const AchievementsPage = () => {
  const { isAuthenticated } = useAuth();

  const { data, loading, error } = useFetch(
    () => getMyAchievements(),
    [isAuthenticated],
    { enabled: isAuthenticated }
  );

  if (loading) return <div className="loading">Loading…</div>;

  if (!isAuthenticated) {
    return (
      <div className="ach-page">
        <PageHeader eyebrow="Your trophies" title={<>The <em>medal case.</em></>} />
        <EmptyState
          icon={<Icon name="user" size={32} stroke={1.25} />}
          title="Log in to see your achievements."
          body="Discord sign-in tracks your progress across streaks, watchtime and collections."
        />
      </div>
    );
  }

  if (error) return <div className="error">Error: {error}</div>;

  const achievements = data?.achievements || [];
  const progress = data?.progress || {};

  const grouped = {};
  for (const a of achievements) {
    const cat = a.category || 'special';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }

  const unlockedCount = achievements.filter((a) => a.unlocked_at).length;
  const totalPoints = achievements.filter((a) => a.unlocked_at).reduce((sum, a) => sum + a.points, 0);
  const visibleTotal = achievements.filter(a => !a.is_hidden || a.unlocked_at).length;

  return (
    <div className="ach-page">
      <PageHeader
        eyebrow="Your trophies"
        title={<>The <em>medal case.</em></>}
        meta={[
          `${unlockedCount} / ${visibleTotal} unlocked`,
          `${totalPoints} points`,
        ]}
        actions={
          <>
            <Link to="/stats" className="btn text">Stats →</Link>
            <Link to="/profile" className="btn text">Profile →</Link>
          </>
        }
      />

      <section>
        <SectionHead num="01" title="Where you stand" meta="Summary" />
        <div className="ach-progress">
          <Stat label="Movies rated" value={progress.rating_count || 0} />
          <Stat label="Best streak" value={progress.longest_streak || 0} unit="screenings" emphasis />
          <Stat
            label="Watch time"
            value={Math.floor((progress.watchtime_minutes || 0) / 60)}
            unit="hours"
          />
          <Stat label="Hot takes" value={progress.hot_take_count || 0} caption="low marks on popular films" />
        </div>
      </section>

      {CATEGORY_ORDER.map((cat) => {
        const catAchievements = grouped[cat];
        if (!catAchievements || catAchievements.length === 0) return null;
        const visible = catAchievements.filter((a) => !a.is_hidden || a.unlocked_at);
        if (visible.length === 0) return null;
        const meta = CATEGORY_META[cat] || { num: '06', label: cat };

        return (
          <section key={cat}>
            <SectionHead
              num={meta.num}
              title={meta.label}
              meta={`${visible.filter(a => a.unlocked_at).length} / ${visible.length}`}
            />
            <div className="ach-grid">
              {visible.map((achievement) => {
                const iconName = ICON_MAP[achievement.icon] || ICON_MAP.default;
                const unlocked = !!achievement.unlocked_at;
                return (
                  <article
                    key={achievement.code}
                    className={`ach-card ${unlocked ? 'unlocked' : 'locked'}`}
                  >
                    <div className="ach-icon">
                      <Icon name={iconName} size={20} stroke={1.5} />
                    </div>
                    <div className="ach-body">
                      <h3 className="ach-name">{achievement.name}</h3>
                      <p className="ach-desc">{achievement.description}</p>
                      <div className="ach-meta">
                        <span className="ach-points">{achievement.points} pts</span>
                        {unlocked && (
                          <>
                            <span className="sep" />
                            <span className="ach-date">
                              {new Date(achievement.unlocked_at).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {unlocked && (
                      <div className="ach-check" aria-label="Unlocked">
                        <Icon name="check" size={14} stroke={2} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default AchievementsPage;
