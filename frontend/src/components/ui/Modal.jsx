import { useEffect, useId, useRef } from 'react';
import Icon from './Icon';
import './Modal.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tracks nested modals so scroll-lock is only released when the last one closes.
let openModalCount = 0;

/**
 * Accessible modal shell: overlay click / Escape to close, focus trap, focus
 * restore on close, body scroll-lock, and dialog aria wiring. Render it
 * conditionally (`{open && <Modal …>}`) or pass `isOpen`.
 */
export default function Modal({ isOpen = true, onClose, title, children, className = '', size = 'md' }) {
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const lastFocused = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    lastFocused.current = document.activeElement;
    openModalCount += 1;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog.
    const node = contentRef.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    const initial = focusables();
    (initial[0] ?? node)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
      lastFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="ui-modal-overlay"
      ref={overlayRef}
      // mousedown (not click) so a text-selection drag ending on the overlay
      // doesn't accidentally close the dialog.
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      <div
        ref={contentRef}
        className={`ui-modal ui-modal-${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className="ui-modal-head">
            <h2 id={titleId} className="ui-modal-title">{title}</h2>
            <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>
  );
}
