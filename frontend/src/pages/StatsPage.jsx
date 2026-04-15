import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api/client';
import { useFetch } from '../hooks';
import { formatMonth, formatRuntime, getAvatarUrl } from '../utils/helpers';
import { Stats } from '../components/home';
import { Icon, PageHeader, SectionHead, Stat, EmptyState } from '../components/ui';
import './StatsPage.css';

const RankList = ({ movies, emptyMessage }) => {
  if (!movies || movies.length === 0) {
    return <p className="sp-empty">{emptyMessage}</p>;
  }
  return (
    <ol className="sp-ranks">
      {movies.map((movie, index) => (
        <li key={movie.id}>
          <Link to={`/movie/${movie.id}`} className="sp-rank">
            <span className="sp-rank-num">{String(index + 1).padStart(2, '0')}</span>
            {movie.image_url && (
              <img src={movie.image_url} alt={movie.title} className="sp-rank-thumb" loading="lazy" />
            )}
            <div className="sp-rank-info">
              <span className="sp-rank-title">{movie.title}</span>
              <span className="sp-rank-votes">{movie.rating_count} vote{movie.rating_count !== 1 ? 's' : ''}</span>
            </div>
            <span className="sp-rank-score">{parseFloat(movie.avg_rating).toFixed(1)}<sub>/10</sub></span>
          </Link>
        </li>
      ))}
    </ol>
  );
};

const StatsPage = () => {
  const [selectedMonth, setSelectedMonth] = useState('');

  const { data: stats, loading, error, setData: setStats } = useFetch(() => getStats(), []);

  const handleMonthChange = async (e) => {
    const month = e.target.value;
    setSelectedMonth(month);
    try {
      const data = await getStats(month || null);
      setStats(data);
    } catch {
      /* handled by display */
    }
  };

  if (loading && !stats) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const monthLabel = selectedMonth ? formatMonth(selectedMonth) : 'This month';

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow="The ledger"
        title={<>By the <em>numbers.</em></>}
        meta={[`${stats.total_movies} screenings`, `${stats.total_ratings} ratings`]}
      />

      <section>
        <SectionHead num="01" title="The running tally" meta="Overall" />
        <Stats stats={stats} />
      </section>

      {stats.total_runtime > 0 && (
        <section className="sp-runtime-row">
          <div className="sp-runtime">
            <span className="sp-runtime-label">Total runtime</span>
            <span className="sp-runtime-value">{formatRuntime(stats.total_runtime)}</span>
            <span className="sp-runtime-caption">spent together in the dark</span>
          </div>
        </section>
      )}

      <section>
        <SectionHead
          num="02"
          title="Top-rated"
          meta="Minimum 3 votes"
        />
        <div className="sp-tri">
          <div>
            <div className="sp-tri-head">
              <select value={selectedMonth} onChange={handleMonthChange}>
                <option value="">This month</option>
                {stats.available_months?.map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            <RankList
              movies={stats.top_month}
              emptyMessage={`Nothing with 3+ votes for ${monthLabel.toLowerCase()}.`}
            />
          </div>
          <div>
            <div className="sp-tri-head"><h3>This year</h3></div>
            <RankList movies={stats.top_year} emptyMessage="Nothing with 3+ votes this year." />
          </div>
          <div>
            <div className="sp-tri-head"><h3>All time</h3></div>
            <RankList movies={stats.top_all_time} emptyMessage="Nothing with 3+ votes yet." />
          </div>
        </div>
      </section>

      <section>
        <SectionHead num="03" title="Bottom-rated" meta="Minimum 3 votes" />
        <div className="sp-tri">
          <div>
            <div className="sp-tri-head"><h3>{monthLabel}</h3></div>
            <RankList
              movies={stats.worst_month}
              emptyMessage={`Nothing with 3+ votes for ${monthLabel.toLowerCase()}.`}
            />
          </div>
          <div>
            <div className="sp-tri-head"><h3>This year</h3></div>
            <RankList movies={stats.worst_year} emptyMessage="Nothing with 3+ votes this year." />
          </div>
          <div>
            <div className="sp-tri-head"><h3>All time</h3></div>
            <RankList movies={stats.worst_all_time} emptyMessage="Nothing with 3+ votes yet." />
          </div>
        </div>
      </section>

      {stats.top_raters?.length > 0 && (
        <section>
          <SectionHead
            num="04"
            title="Most prolific raters"
            meta={`${stats.top_raters.length} regulars`}
          />
          <ol className="sp-raters">
            {stats.top_raters.map((rater, index) => (
              <li key={rater.discord_id}>
                <Link to={`/user/${rater.id}`} className="sp-rater">
                  <span className="sp-rater-rank">{String(index + 1).padStart(2, '0')}</span>
                  <img
                    src={getAvatarUrl(rater.discord_id, rater.avatar)}
                    alt={rater.username}
                    className="sp-rater-avatar"
                    loading="lazy"
                  />
                  <div className="sp-rater-body">
                    <span className="sp-rater-name">{rater.username}</span>
                    <span className="sp-rater-sub">{rater.rating_count} ratings · avg {parseFloat(rater.avg_rating).toFixed(1)}</span>
                  </div>
                  <Icon name="arrow-right" size={14} className="sp-rater-arrow" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {stats.streak_leaderboard?.length > 0 && (
        <section>
          <SectionHead
            num="05"
            title="The streak board"
            meta="Consecutive screenings"
          />
          <ol className="sp-raters">
            {stats.streak_leaderboard.map((user, index) => (
              <li key={user.discord_id}>
                <Link to={`/user/${user.id}`} className="sp-rater">
                  <span className="sp-rater-rank">{String(index + 1).padStart(2, '0')}</span>
                  <img
                    src={getAvatarUrl(user.discord_id, user.avatar)}
                    alt={user.username}
                    className="sp-rater-avatar"
                    loading="lazy"
                  />
                  <div className="sp-rater-body">
                    <span className="sp-rater-name">{user.username}</span>
                    <span className="sp-rater-sub">
                      Best {user.longest_streak} · {user.current_streak > 0 ? `${user.current_streak} current` : 'no active streak'}
                    </span>
                  </div>
                  <span className="sp-rater-badge">{user.longest_streak}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};

export default StatsPage;
