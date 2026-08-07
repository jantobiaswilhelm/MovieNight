import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/helpers';
import SegmentedControl from './SegmentedControl';
import './shared.css';

const f1 = (v) => parseFloat(v).toFixed(1);

const METRICS = {
  ratings: { label: 'Most ratings', key: 'top_raters', gold: false,
    row: (p) => ({ sub: `avg given ${f1(p.avg_rating)}`, badge: p.rating_count }) },
  taste: { label: 'Best taste', key: 'best_taste_hosts', gold: true,
    row: (p) => ({ sub: `${p.nights_hosted} hosted`, badge: f1(p.avg_rating) }) },
  hosted: { label: 'Most hosted', key: 'top_hosts', gold: false,
    row: (p) => ({ sub: `avg pick ${f1(p.avg_pick_rating)}`, badge: p.night_count }) },
  streak: { label: 'Longest streak', key: 'streak_leaderboard', gold: false,
    row: (p) => ({ sub: p.current_streak > 0 ? `${p.current_streak} current` : 'no active streak', badge: p.longest_streak }) },
  loyal: { label: 'Most loyal', key: 'most_loyal', gold: false,
    row: (p) => ({ sub: 'nights attended', badge: p.attended_count }) }
};
const ORDER = ['ratings', 'taste', 'hosted', 'streak', 'loyal'];

const HotCold = ({ tag, cls, person }) => (
  <Link to={`/user/${person.id}`} className={`st-hc ${cls}`}>
    <span className="st-hc-tag">{tag}</span>
    <img className="st-avatar" src={getAvatarUrl(person.discord_id, person.avatar)} alt="" loading="lazy" />
    <div className="st-hc-body">
      <span className="n">{person.username}</span>
      <span className="s">{person.rating_count} ratings</span>
    </div>
    <span className="st-hc-num">{f1(person.avg_given)}</span>
  </Link>
);

export default function PeopleLeaderboard({ stats }) {
  const available = ORDER.filter((m) => (stats[METRICS[m].key] || []).length > 0);
  const [metric, setMetric] = useState(available[0] || 'ratings');

  const extremes = stats.rater_extremes || {};
  const hasHotCold = extremes.most_generous || extremes.harshest;

  if (available.length === 0 && !hasHotCold) return null;

  const active = METRICS[metric] || METRICS.ratings;
  const list = stats[active.key] || [];

  return (
    <div className="st-module">
      {hasHotCold && (
        <div className="st-hotcold">
          {extremes.most_generous
            ? <HotCold tag="Most generous" cls="gen" person={extremes.most_generous} />
            : <span />}
          {extremes.harshest
            ? <HotCold tag="Harshest" cls="harsh" person={extremes.harshest} />
            : <span />}
        </div>
      )}
      <div className="st-module-head">
        <span className="st-mh-title">{active.label}</span>
        <div className="st-controls">
          <SegmentedControl
            value={metric}
            onChange={setMetric}
            options={available.map((m) => ({ value: m, label: METRICS[m].label.replace(/^(Most |Best |Longest )/, '') }))}
          />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="st-empty">Nothing to show here yet.</p>
      ) : (
        <ol className="st-ranks">
          {list.map((p, i) => {
            const m = active.row(p);
            return (
              <li key={p.id}>
                <Link to={`/user/${p.id}`} className="st-rank">
                  <span className="st-rk">{String(i + 1).padStart(2, '0')}</span>
                  <img className="st-avatar" src={getAvatarUrl(p.discord_id, p.avatar)} alt="" loading="lazy" />
                  <div className="st-rbody">
                    <span className="st-rname">{p.username}</span>
                    <span className="st-rsub">{m.sub}</span>
                  </div>
                  <span className={`st-rmetric ${active.gold ? 'gold' : 'bone'}`}>
                    {m.badge}{active.gold ? <small>/10</small> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
