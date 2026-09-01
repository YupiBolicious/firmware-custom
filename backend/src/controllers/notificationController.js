const notificationService = require('../services/notificationService');

const list = async (req, res, next) => {
  try {
    const data = await notificationService.listNotifications(req.user.id);
    res.json({ success: true, message: 'Notifications retrieved', data });
  } catch (err) {
    next(err);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, message: 'Unread count retrieved', data: { count } });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const updated = await notificationService.markOneRead(req.user.id, Number(req.params.id));
    res.json({ success: true, message: 'Notification marked as read', data: { updated } });
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    const updated = await notificationService.markAllRead(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read', data: { updated } });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, unreadCount, markRead, markAllRead };
