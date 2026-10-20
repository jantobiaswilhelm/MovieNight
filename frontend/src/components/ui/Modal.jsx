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
 *
 * `variant="drawer"` docks it to the right edge (a bottom sheet on phones) and
 * drops the built-in head; pass `label` so the dialog still has a name.
 */
export default function Modal({ isOpen = true, onClose, title, label, children, className = '', size = 'md', variant = 'center' }) {
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
    // A drawer opens on its own panel so its first control (the close button)
    // doesn't light up; Tab moves into it from there.
    const initial = focusables();
    (variant === 'drawer' ? node : initial[0] ?? node)?.focus();

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
  }, [isOpen, onClose, variant]);

  if (!isOpen) return null;

  const isDrawer = variant === 'drawer';

  if (isDrawer) {
    return (
      <div
        className="ui-modal-overlay is-drawer"
        ref={overlayRef}
        onMouseDown={(e) => {
          if (e.target === overlayRef.current) onClose?.();
        }}
      >
        <div
          ref={contentRef}
          className={`ui-drawer ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
    );
  }

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
