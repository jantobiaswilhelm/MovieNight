import './ui.css';

export default function Badge({ live = false, accent = false, className = '', children, ...rest }) {
  const classes = [
    'badge',
    accent ? 'badge-accent' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {live && <span className="dot" />}
      {children}
    </span>
  );
}
