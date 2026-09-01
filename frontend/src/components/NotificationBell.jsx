import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import useNotifications from '../pages/useNotifications';

export default function NotificationBell() {
  const { notifications, unreadCount, open, setOpen, markRead, markAllRead, busy } =
    useNotifications();
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [setOpen]);

  const openItem = (n) => {
    setOpen(false);
    navigate(`/work-orders/${n.entity_id}`);
  };

  const formatTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button className="notif-markall" disabled={busy} onClick={markAllRead}>
                <CheckCheck size={14} strokeWidth={1.5} /> Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.is_read ? 'is-read' : 'is-unread'}`}
                  onClick={() => {
                    if (!n.is_read) markRead(n.id);
                    openItem(n);
                  }}
                >
                  <div className="notif-message">{n.message}</div>
                  <div className="notif-meta">
                    {formatTime(n.created_at)}
                    {!n.is_read && <span className="notif-dot" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
