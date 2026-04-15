import './ui.css';

export default function Chip({ variant = 'default', className = '', children, ...rest }) {
  const classes = [
    'chip',
    variant !== 'default' ? variant : '',
    className,
  ].filter(Boolean).join(' ');
  return <span className={classes} {...rest}>{children}</span>;
}
