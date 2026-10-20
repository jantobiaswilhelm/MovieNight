import { Modal } from '../ui';
import ScreeningComposer from './ScreeningComposer';

/**
 * The composer as a side drawer (a bottom sheet on phones), for pages with no
 * room to schedule inline. Opened through useScheduler().
 */
export default function ScreeningDrawer({ request, onClose }) {
  const verb = request.mode === 'reschedule' ? 'Reschedule' : 'Schedule';
  return (
    <Modal isOpen onClose={onClose} variant="drawer" label={`${verb} ${request.film.title}`} className="sd">
      <ScreeningComposer request={request} onClose={onClose} />
    </Modal>
  );
}
