import './ui.css';

export default function EmptyState({ icon, title, body, action, className = '' }) {
  return (
    <div className={`ui-empty ${className}`.trim()}>
      {icon && <div className="ui-empty-icon">{icon}</div>}
      {title && <h4>{title}</h4>}
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
