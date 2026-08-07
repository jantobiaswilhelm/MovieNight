import './RatingHistogram.css';

export default function RatingHistogram({ distribution, avg }) {
  if (!distribution || distribution.length === 0) return null;
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const avgNum = parseFloat(avg);
  const avgPct = Number.isFinite(avgNum) ? ((avgNum - 0.5) / 10) * 100 : null;

  return (
    <div className="hist">
      {avgPct != null && (
        <>
          <span className="hist-avgline" style={{ left: `${avgPct}%` }} aria-hidden="true" />
          <span className="hist-avgtag" style={{ left: `${avgPct}%` }}>avg {avgNum.toFixed(1)}</span>
        </>
      )}
      {distribution.map((d) => (
        <div className="hist-bar" key={d.score}>
          <span className="hist-ct">{d.count}</span>
          <span className="hist-fill" style={{ height: `${Math.round((d.count / max) * 100)}%` }} />
          <span className="hist-bx">{d.score}</span>
        </div>
      ))}
    </div>
  );
}
