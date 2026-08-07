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

const PeopleList = ({ people, metric, emptyMessage }) => {
  if (!people || people.length === 0) {
    return <p className="sp-empty">{emptyMessage}</p>;
  }
  return (
    <ol className="sp-raters">
      {people.map((p, index) => (
        <li key={p.id}>
          <Link to={`/user/${p.id}`} className="sp-rater">
            <span className="sp-rater-rank">{String(index + 1).padStart(2, '0')}</span>
            <img
              src={getAvatarUrl(p.discord_id, p.avatar)}
              alt={p.username}
              className="sp-rater-avatar"
              loading="lazy"
            />
            <div className="sp-rater-body">
              <span className="sp-rater-name">{p.username}</span>
              {metric(p).sub && <span className="sp-rater-sub">{metric(p).sub}</span>}
            </div>
            <span className="sp-rater-badge">{metric(p).badge}</span>
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

      {(stats.top_hosts?.length > 0 || stats.best_taste_hosts?.length > 0) && (
        <section>
          <SectionHead num="06" title="The people" meta="Hosts & critics" />
          <div className="sp-tri sp-people-cols">
            <div>
              <div className="sp-tri-head"><h3>Top hosts</h3></div>
              <PeopleList
                people={stats.top_hosts}
                emptyMessage="No hosts yet."
                metric={(p) => ({
                  sub: `avg pick ${parseFloat(p.avg_pick_rating).toFixed(1)}`,
                  badge: p.night_count
                })}
              />
            </div>
            <div>
              <div className="sp-tri-head"><h3>Best taste</h3></div>
              <PeopleList
                people={stats.best_taste_hosts}
                emptyMessage="Nobody has hosted 3+ nights yet."
                metric={(p) => ({
                  sub: `${p.nights_hosted} hosted`,
                  badge: parseFloat(p.avg_rating).toFixed(1)
                })}
              />
            </div>
          </div>

          {(stats.rater_extremes?.most_generous || stats.rater_extremes?.harshest) && (
            <div className="sp-verdicts">
              {stats.rater_extremes?.most_generous && (
                <div className="sp-verdict sp-verdict-gen">
                  <span className="sp-verdict-tag">Most generous</span>
                  <Link to={`/user/${stats.rater_extremes.most_generous.id}`} className="sp-verdict-body">
                    <img
                      src={getAvatarUrl(stats.rater_extremes.most_generous.discord_id, stats.rater_extremes.most_generous.avatar)}
                      alt={stats.rater_extremes.most_generous.username}
                      className="sp-rater-avatar"
                      loading="lazy"
                    />
                    <div className="sp-rater-body">
                      <span className="sp-rater-name">{stats.rater_extremes.most_generous.username}</span>
                      <span className="sp-rater-sub">{stats.rater_extremes.most_generous.rating_count} ratings</span>
                    </div>
                    <span className="sp-verdict-num sp-num-gold">
                      {parseFloat(stats.rater_extremes.most_generous.avg_given).toFixed(1)}
                    </span>
                  </Link>
                </div>
              )}
              {stats.rater_extremes?.harshest && (
                <div className="sp-verdict sp-verdict-harsh">
                  <span className="sp-verdict-tag">Harshest</span>
                  <Link to={`/user/${stats.rater_extremes.harshest.id}`} className="sp-verdict-body">
                    <img
                      src={getAvatarUrl(stats.rater_extremes.harshest.discord_id, stats.rater_extremes.harshest.avatar)}
                      alt={stats.rater_extremes.harshest.username}
                      className="sp-rater-avatar"
                      loading="lazy"
                    />
                    <div className="sp-rater-body">
                      <span className="sp-rater-name">{stats.rater_extremes.harshest.username}</span>
                      <span className="sp-rater-sub">{stats.rater_extremes.harshest.rating_count} ratings</span>
                    </div>
                    <span className="sp-verdict-num sp-num-ember">
                      {parseFloat(stats.rater_extremes.harshest.avg_given).toFixed(1)}
                    </span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {stats.most_loyal?.length > 0 && (
            <div className="sp-loyal">
              <div className="sp-tri-head"><h3>Most loyal</h3></div>
              <PeopleList
                people={stats.most_loyal}
                emptyMessage="No attendance recorded yet."
                metric={(p) => ({ sub: 'nights attended', badge: p.attended_count })}
              />
            </div>
          )}
        </section>
      )}

      {(stats.most_divisive?.most_divisive || stats.signature?.top_genre || stats.cadence?.busiest_month) && (
        <section>
          <SectionHead num="07" title="Club lore" meta="Fun facts" />
          <div className="sp-facts">
            {stats.most_divisive?.most_divisive && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Most divisive</span>
                <Link to={`/movie/${stats.most_divisive.most_divisive.id}`} className="sp-fact-big">
                  {stats.most_divisive.most_divisive.title}
                </Link>
                <div className="sp-fact-chips">
                  <span className="sp-chip sp-chip-love">loved {parseFloat(stats.most_divisive.most_divisive.high).toFixed(1)}</span>
                  <span className="sp-chip sp-chip-hate">hated {parseFloat(stats.most_divisive.most_divisive.low).toFixed(1)}</span>
                </div>
                <p className="sp-fact-note">
                  {stats.most_divisive.most_divisive.rating_count} votes · widest spread
                </p>
              </div>
            )}

            {stats.signature?.top_genre && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Signature</span>
                <span className="sp-fact-big">{stats.signature.top_genre.genre}</span>
                <p className="sp-fact-sub">most-watched genre · {stats.signature.top_genre.count} nights</p>
                {stats.signature.top_decade && (
                  <p className="sp-fact-note">
                    Favourite decade: <strong>{stats.signature.top_decade.decade}s</strong>
                  </p>
                )}
              </div>
            )}

            {stats.cadence?.busiest_month && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Cadence</span>
                <span className="sp-fact-big">
                  {parseFloat(stats.cadence.avg_per_month).toFixed(1)}<span className="sp-fact-unit"> /mo</span>
                </span>
                <p className="sp-fact-sub">average movies per month</p>
                <p className="sp-fact-note">
                  Busiest: <strong>{formatMonth(stats.cadence.busiest_month)}</strong>, {stats.cadence.busiest_count} nights
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default StatsPage;
