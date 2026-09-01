const notificationRepository = require('../repositories/notificationRepository');

const notify = async ({ user_id, username, status, message, entity_id }) => {
  try {
    await notificationRepository.create({ user_id, user_name: username, status, message, entity_id });
  } catch (err) {
    console.error('Notification send failed:', err.message);
  }
};

const listNotifications = async (userId) => {
  return notificationRepository.findByUserId(userId);
};

const getUnreadCount = async (userId) => {
  return notificationRepository.countUnread(userId);
};

const markOneRead = async (userId, notificationId) => {
  return notificationRepository.markRead(userId, notificationId);
};

const markAllRead = async (userId) => {
  return notificationRepository.markAllRead(userId);
};

module.exports = { notify, listNotifications, getUnreadCount, markOneRead, markAllRead };
