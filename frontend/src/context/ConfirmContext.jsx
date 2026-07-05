import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/ui';
import './Confirm.css';

const ConfirmContext = createContext(null);

/**
 * Returns an async `confirm(options)` that resolves to true/false.
 * Replaces window.confirm with an accessible, on-brand dialog.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete?', danger: true }))) return;
 */
export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
};

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve;
    setState({
      title: opts.title ?? 'Are you sure?',
      message: opts.message ?? '',
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false
    });
  }), []);

  const settle = (result) => {
    setState(null);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal isOpen title={state.title} size="sm" onClose={() => settle(false)}>
          {state.message && <p className="ui-confirm-msg">{state.message}</p>}
          <div className="ui-confirm-actions">
            <button type="button" className="btn ghost" onClick={() => settle(false)}>
              {state.cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${state.danger ? 'destructive' : ''}`.trim()}
              onClick={() => settle(true)}
            >
              {state.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
};
