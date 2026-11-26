import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { store } from '../repositories/store';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const notifications = store.getNotifications(req.user!.id);
  const unreadCount = notifications.filter((n) => !n.read).length;
  res.json({ notifications, unreadCount });
});

router.patch('/:id/read', (req: AuthenticatedRequest, res: Response) => {
  const list = store.getNotifications(req.user!.id);
  const target = list.find((n) => n.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  const updated = store.saveNotification({ ...target, read: true });
  res.json({ notification: updated });
});

router.post('/mark-all-read', (req: AuthenticatedRequest, res: Response) => {
  store.markAllNotificationsRead(req.user!.id);
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
