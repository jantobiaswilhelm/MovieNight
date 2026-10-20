import './ui.css';

export default function EmptyState({ icon, title, body, action, className = '' }) {
  return (
    <div className={`ui-empty ${className}`.trim()}>
      {icon && <div className="ui-empty-icon">{icon}</div>}
      {title && <p className="ui-empty-title">{title}</p>}
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
