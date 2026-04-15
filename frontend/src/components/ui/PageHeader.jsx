import './ui.css';

export default function PageHeader({ eyebrow, title, meta, actions, className = '' }) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ph-left">
        {eyebrow && <div className="ph-eyebrow">{eyebrow}</div>}
        {title && <h1>{title}</h1>}
        {meta && (
          <div className="ph-meta">
            {Array.isArray(meta)
              ? meta.flatMap((item, i) =>
                  i === 0
                    ? [<span key={`m-${i}`}>{item}</span>]
                    : [<span key={`s-${i}`} className="sep" />, <span key={`m-${i}`}>{item}</span>]
                )
              : meta}
          </div>
        )}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </header>
  );
}
