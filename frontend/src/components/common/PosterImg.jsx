import { useCallback, useState } from 'react';

// TMDB posters land well after first paint, so a grid of them reads as a wall
// of empty rectangles until they arrive. The wrapper keeps a drawn surface and
// the image fades in over it once decoded, instead of snapping in over a void.
export default function PosterImg({ src, alt = '', className = '', ...rest }) {
  const [loaded, setLoaded] = useState(false);

  // A cached image can finish loading before React attaches onLoad, which would
  // otherwise leave it stuck at opacity 0.
  const ref = useCallback((node) => {
    if (node && node.complete) setLoaded(true);
  }, []);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      // On error, reveal it anyway so the browser's broken-image state and the
      // alt text still reach the reader.
      onError={() => setLoaded(true)}
      className={`poster-img ${loaded ? 'is-loaded' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      {...rest}
    />
  );
}
