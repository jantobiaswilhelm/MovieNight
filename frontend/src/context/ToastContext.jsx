import { createContext, useCallback, useContext, useState } from 'react';
import './Toast.css';

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

let nextId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type, duration) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const showSuccess = useCallback((m, d = 4000) => show(m, 'success', d), [show]);
  const showError = useCallback((m, d = 6000) => show(m, 'error', d), [show]);
  const showInfo = useCallback((m, d = 4000) => show(m, 'info', d), [show]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo, dismiss }}>
      {children}
      <div className="ui-toasts" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast-${t.type}`} role="status">
            <span className="ui-toast-msg">{t.message}</span>
            <button className="ui-toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
