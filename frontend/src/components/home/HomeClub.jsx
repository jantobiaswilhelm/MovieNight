import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGuildUsers } from '../../api/client';
import { getAvatarUrl, splitTitleYear } from '../../utils/helpers';
import { SectionHead, Stat } from '../ui';
import { CountUp } from '../common';
import './HomeClub.css';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FAKE = { movies: '∞', hours: '999,999', rating: '11.0' };
const num = (v) => (Number(v) || 0).toFixed(1);

// A leaderboard without card chrome: the leader on one line, two runners under it.
function Podium({ kicker, list, metric, runnerMetric, accent = '' }) {
  const [leader, ...rest] = list;
  if (!leader) return null;
  return (
    <div className="club-podium">
      <span className="club-kicker">{kicker}</span>
      <Link to={`/user/${leader.id}`} className="club-leader">
        <img className="club-leader-av" src={getAvatarUrl(leader.discord_id, leader.avatar)} alt="" loading="lazy" />
        <span className="club-leader-name">{leader.username}</span>
        <span className={`club-leader-metric ${accent}`.trim()}>{metric(leader)}</span>
      </Link>
      {rest.length > 0 && (
        <ol className="club-runners">
          {rest.slice(0, 2).map((r, i) => (
            <li key={r.id}>
              <Link to={`/user/${r.id}`} className="club-runner">
                <span className="club-runner-rank">{i + 2}</span>
                <img className="club-runner-av" src={getAvatarUrl(r.discord_id, r.avatar)} alt="" loading="lazy" />
                <span className="club-runner-name">{r.username}</span>
                <span className="club-runner-metric">{runnerMetric(r)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The club's record in one band: the three totals, each heading the
 * leaderboard it belongs to (films ↔ hosts, hours ↔ critics, average ↔ taste),
 * the best-rated films of the last 30 days under the ratings column, and the
 * member roster to close.
 */
export default function HomeClub({ stats, best = [], seasonalKey = null }) {
  const prank = seasonalKey === 'aprilfools' && !reducedMotion();
  const [revealed, setRevealed] = useState(!prank);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!prank) { setRevealed(true); return undefined; }
    const t = setTimeout(() => setRevealed(true), 1400);
    return () => clearTimeout(t);
  }, [prank]);

  useEffect(() => {
    let alive = true;
    getGuildUsers()
      .then((data) => { if (alive) setMembers(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!stats && members.length === 0) return null;

  const hours = Math.round((stats?.total_runtime || 0) / 60);
  const avg = Number(stats?.overall_avg_rating) || 0;

  return (
    <section className="club" aria-label="The Club">
      <SectionHead title="The Club" meta={<Link to="/stats" className="btn text">Stats →</Link>} />

      {stats && (
        <div className="club-grid">
          <div className="club-col">
            <Stat label="Movies watched" value={revealed ? <CountUp value={stats.total_movies} /> : FAKE.movies} />
            <Podium
              kicker="Top host"
              list={stats.top_hosts || []}
              accent="is-ember"
              metric={(u) => <>{u.night_count}<small>nights</small></>}
              runnerMetric={(u) => u.night_count}
            />
          </div>

          <div className="club-col">
            <Stat label="Hours watched" value={revealed ? <CountUp value={hours} /> : FAKE.hours} />
            <Podium
              kicker="Top critic"
              list={stats.top_raters || []}
              metric={(u) => <>{u.rating_count}<small>ratings</small></>}
              runnerMetric={(u) => u.rating_count}
            />
          </div>

          <div className="club-col is-ratings">
            {/* Counts may count; a 1–10 average may not. Ticking it up from zero
                reads as broken data ("0.3/10") for the length of the animation. */}
            <Stat
              label="Average rating"
              value={revealed ? avg.toFixed(1) : FAKE.rating}
              unit={revealed ? '/10' : '/11'}
            />
            <Podium
              kicker="Best taste"
              list={stats.best_taste_hosts || []}
              accent="is-gold"
              metric={(u) => <>{num(u.avg_rating)}<small>/10</small></>}
              runnerMetric={(u) => num(u.avg_rating)}
            />
            {best.length > 0 && (
              <div className="club-best">
                <span className="club-kicker">Best of the last 30 days</span>
                <ol>
                  {best.slice(0, 3).map((m) => (
                    <li key={m.id}>
                      <Link to={`/movie/${m.id}`} className="club-best-row">
                        <span className="club-best-title">{splitTitleYear(m.title).name}</span>
                        <span className="club-best-score">{num(m.avg_rating)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div className="club-roster">
          <ul className="club-avatars">
            {members.map((u) => (
              <li key={u.id}>
                <Link to={`/user/${u.id}`} className="club-avatar" title={u.username} aria-label={u.username}>
                  <img src={getAvatarUrl(u.discord_id, u.avatar)} alt="" loading="lazy" />
                </Link>
              </li>
            ))}
          </ul>
          <span className="club-roster-count">{members.length} members</span>
        </div>
      )}
    </section>
  );
}
