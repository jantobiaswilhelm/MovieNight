import './ui.css';

export default function SectionHead({ num, title, meta, className = '' }) {
  return (
    <div className={`ui-section-head ${className}`.trim()}>
      {num && <span className="num">{num}</span>}
      {title && <span className="title">{title}</span>}
      <span className="rule" />
      {meta && <span className="meta">{meta}</span>}
    </div>
  );
}
