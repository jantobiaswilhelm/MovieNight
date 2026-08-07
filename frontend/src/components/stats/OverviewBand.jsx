import './OverviewBand.css';

export default function OverviewBand({ stats }) {
  const hours = Math.round((stats.total_runtime || 0) / 60);
  const cells = [
    ['Screenings', Number(stats.total_movies).toLocaleString()],
    ['Hours in the dark', hours.toLocaleString()],
    ['Ratings cast', Number(stats.total_ratings).toLocaleString()],
    ['Club average', <>{parseFloat(stats.overall_avg_rating).toFixed(1)}<span className="ob-unit">/10</span></>],
    ['Voters', Number(stats.total_raters).toLocaleString()]
  ];
  return (
    <div className="ob-band">
      {cells.map(([label, value]) => (
        <div className="ob-cell" key={label}>
          <span className="ob-lbl">{label}</span>
          <span className="ob-val">{value}</span>
        </div>
      ))}
    </div>
  );
}
