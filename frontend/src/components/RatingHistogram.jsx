import './RatingHistogram.css';

const RatingHistogram = ({ histogram }) => {
  if (!histogram || histogram.length === 0) {
    return (
      <div className="rating-histogram">
        <h3>Rating Distribution</h3>
        <p className="histogram-empty">No ratings yet</p>
      </div>
    );
  }

  const maxCount = Math.max(...histogram.map(h => h.count), 1);

  return (
    <div className="rating-histogram">
      <h3>Rating Distribution</h3>
      <div className="histogram-chart">
        {histogram.map((item) => (
          <div key={item.score} className="histogram-bar-container">
            <div
              className="histogram-bar"
              style={{ height: `${(item.count / maxCount) * 100}%` }}
              title={`${item.score}: ${item.count} rating${item.count !== 1 ? 's' : ''}`}
            >
              {item.count > 0 && <span className="bar-count">{item.count}</span>}
            </div>
            <span className="histogram-label">{parseFloat(item.score).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RatingHistogram;
