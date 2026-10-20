import './ui.css';

export default function SectionHead({ num, title, meta, className = '' }) {
  return (
    <div className={`ui-section-head ${className}`.trim()}>
      {num && <span className="num">{num}</span>}
      {title && <h2 className="title">{title}</h2>}
      <span className="rule" />
      {meta && <span className="meta">{meta}</span>}
    </div>
  );
}
