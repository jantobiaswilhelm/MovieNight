import { sanitizeImageUrl } from '../../utils/sanitizeUrl';
import './Backdrop.css';

// A faint, feathered film backdrop layer — mirrors the home page's .rf-bg.
// Renders nothing when there is no usable image. Place as the first child of a
// container that has the `st-has-bg` class.
export default function Backdrop({ image }) {
  const src = sanitizeImageUrl(image);
  if (!src) return null;
  return <div className="st-bg" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />;
}
