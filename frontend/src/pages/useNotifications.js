import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';

const POLL_INTERVAL = 30000;

export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/unread-count'),
      ]);
      if (!mountedRef.current) return;
      setNotifications(Array.isArray(listRes.data.data) ? listRes.data.data : []);
      setUnreadCount(countRes.data?.data?.count || 0);
    } catch (err) {
      /* silent */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const timer = setInterval(load, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const markRead = useCallback(
    async (id) => {
      setBusy(true);
      try {
        await api.post(`/notifications/${id}/read`);
        await load();
      } catch (err) {
        /* silent */
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const markAllRead = useCallback(async () => {
    setBusy(true);
    try {
      await api.post('/notifications/mark-all-read');
      await load();
    } catch (err) {
      /* silent */
    } finally {
      setBusy(false);
    }
  }, [load]);

  return { notifications, unreadCount, open, setOpen, markRead, markAllRead, busy, refresh: load };
}
