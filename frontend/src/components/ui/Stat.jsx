import './ui.css';

export default function Stat({ label, value, unit, caption, emphasis = false, className = '' }) {
  return (
    <div className={`ui-stat ${emphasis ? 'emphasis' : ''} ${className}`.trim()}>
      {label && <div className="stat-label">{label}</div>}
      <div className="stat-value">
        {value}
        {unit && <sub>{unit}</sub>}
      </div>
      {caption && <div className="stat-caption">{caption}</div>}
    </div>
  );
}
