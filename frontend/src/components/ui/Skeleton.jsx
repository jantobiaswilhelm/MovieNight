import './ui.css';

export default function Skeleton({ variant = 'line', size, width, height, className = '', style, ...rest }) {
  const classes = [
    'skeleton',
    variant,
    size === 'lg' ? 'lg' : '',
    className,
  ].filter(Boolean).join(' ');

  const inline = { ...style };
  if (width != null) inline.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) inline.height = typeof height === 'number' ? `${height}px` : height;

  return <span className={classes} style={inline} {...rest} />;
}
