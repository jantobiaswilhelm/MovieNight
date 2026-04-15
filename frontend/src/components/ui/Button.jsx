import './ui.css';

export default function Button({
  variant = 'primary',
  size = 'md',
  as: As = 'button',
  className = '',
  children,
  leftIcon,
  rightIcon,
  ...rest
}) {
  const classes = [
    'btn',
    variant !== 'primary' ? variant : '',
    size !== 'md' ? size : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <As className={classes} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </As>
  );
}
