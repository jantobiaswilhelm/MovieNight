import { Stat } from '../ui';
import './Stats.css';

const Stats = ({ stats }) => {
  return (
    <div className="stats-grid">
      <Stat label="Movies watched" value={stats.total_movies} caption="since the club began" />
      <Stat label="Ratings cast" value={stats.total_ratings} caption="total verdicts" />
      <Stat
        label="Average rating"
        value={parseFloat(stats.overall_avg_rating).toFixed(1)}
        unit="/10"
        caption="across the ledger"
        emphasis
      />
      <Stat label="Unique voters" value={stats.total_raters} caption="distinct raters" />
    </div>
  );
};

export default Stats;
