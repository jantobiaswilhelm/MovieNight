import './ui.css';

export default function Card({
  variant = 'default',
  as: As = 'div',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'card',
    variant !== 'default' ? variant : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <As className={classes} {...rest}>
      {children}
    </As>
  );
}
