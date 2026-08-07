import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/helpers';
import './HomeHallOfFame.css';

const num = (v) => (Number(v) || 0).toFixed(1);

// One podium card: #1 featured, #2/#3 as small runner rows.
const PodiumCard = ({ kicker, leader, runners, renderMetric, renderRunnerMetric, accent }) => (
  <div className="hof-card">
    <span className="hof-kicker">{kicker}</span>
    <Link to={`/user/${leader.id}`} className="hof-lead">
      <img className="hof-avatar" src={getAvatarUrl(leader.discord_id, leader.avatar)} alt="" loading="lazy" />
      <span className="hof-name">{leader.username}</span>
    </Link>
    <span className={`hof-metric${accent ? ` ${accent}` : ''}`}>{renderMetric(leader)}</span>
    {runners.length > 0 && (
      <div className="hof-runners">
        {runners.map((r, i) => (
          <Link key={r.id} to={`/user/${r.id}`} className="hof-run">
            <span className="hof-run-rank">{i + 2}</span>
            <img className="hof-run-av" src={getAvatarUrl(r.discord_id, r.avatar)} alt="" loading="lazy" />
            <span className="hof-run-name">{r.username}</span>
            <span className="hof-run-metric">{renderRunnerMetric(r)}</span>
          </Link>
        ))}
      </div>
    )}
  </div>
);

export default function HomeHallOfFame({ stats }) {
  if (!stats) return null;
  const hosts = stats.top_hosts || [];
  const critics = stats.top_raters || [];
  const taste = stats.best_taste_hosts || [];

  const topHost = hosts[0];
  const topCritic = critics[0];
  const bestTaste = taste[0];
  if (!topHost && !topCritic && !bestTaste) return null;

  return (
    <section className="home-hof" aria-label="Hall of fame">
      <div className="home-hof-head">
        <span className="t-eyebrow">Hall of fame</span>
        <Link to="/stats" className="btn text">Full stats →</Link>
      </div>
      <div className="home-hof-grid">
        {topHost && (
          <PodiumCard
            kicker="Top host"
            leader={topHost}
            runners={hosts.slice(1, 3)}
            accent="ember"
            renderMetric={(u) => <>{u.night_count} nights</>}
            renderRunnerMetric={(u) => u.night_count}
          />
        )}
        {topCritic && (
          <PodiumCard
            kicker="Top critic"
            leader={topCritic}
            runners={critics.slice(1, 3)}
            renderMetric={(u) => <>{u.rating_count} <small>ratings</small></>}
            renderRunnerMetric={(u) => u.rating_count}
          />
        )}
        {bestTaste && (
          <PodiumCard
            kicker="Best taste"
            leader={bestTaste}
            runners={taste.slice(1, 3)}
            accent="gold"
            renderMetric={(u) => <>{num(u.avg_rating)}<small>/10</small></>}
            renderRunnerMetric={(u) => num(u.avg_rating)}
          />
        )}
      </div>
    </section>
  );
}
