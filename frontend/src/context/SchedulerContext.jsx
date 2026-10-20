import { createContext, useCallback, useContext, useState } from 'react';
import ScreeningDrawer from '../components/scheduler/ScreeningDrawer';

const SchedulerContext = createContext(null);

/**
 * Returns `openScheduler(request)`, which opens the screening drawer:
 *
 *   openScheduler({
 *     mode: 'announce' | 'reschedule',
 *     film,                 // filmFromTmdb(...) or filmFromRow(...)
 *     submit: async (iso) => ({ announcementId }),  // performs the API call
 *     unschedule,           // reschedule only: async () => updated row ("Make TBD")
 *     currentAt, movieId,   // reschedule only
 *     onDone,               // called with submit's result after success
 *   });
 */
export const useScheduler = () => {
  const ctx = useContext(SchedulerContext);
  if (!ctx) throw new Error('useScheduler must be used within a SchedulerProvider');
  return ctx;
};

export const SchedulerProvider = ({ children }) => {
  const [request, setRequest] = useState(null);
  const close = useCallback(() => setRequest(null), []);

  return (
    <SchedulerContext.Provider value={setRequest}>
      {children}
      {request && <ScreeningDrawer request={request} onClose={close} />}
    </SchedulerContext.Provider>
  );
};
