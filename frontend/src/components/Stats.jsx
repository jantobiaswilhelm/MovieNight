import './Stats.css';

const Stats = ({ stats }) => {
  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-value">{stats.total_movies}</div>
        <div className="stat-label">Movies Watched</div>
      </div>

      <div className="stat-card">
        <div className="stat-value">{stats.total_ratings}</div>
        <div className="stat-label">Total Ratings</div>
      </div>

      <div className="stat-card">
        <div className="stat-value">
          {parseFloat(stats.overall_avg_rating).toFixed(1)}
        </div>
        <div className="stat-label">Average Rating</div>
      </div>

      <div className="stat-card">
        <div className="stat-value">{stats.total_raters}</div>
        <div className="stat-label">Unique Raters</div>
      </div>
    </div>
  );
};

export default Stats;
