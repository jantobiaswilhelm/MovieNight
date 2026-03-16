import { useState, useCallback } from 'react';

/**
 * Hook for managing modal open/close state with optional associated data.
 *
 * @param {boolean} initialOpen - Whether the modal starts open (default false)
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState(null);

  const open = useCallback((modalData = null) => {
    setData(modalData);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggle = useCallback((modalData = null) => {
    setIsOpen((prev) => {
      if (prev) {
        setData(null);
        return false;
      }
      setData(modalData);
      return true;
    });
  }, []);

  return { isOpen, data, open, close, toggle };
}
