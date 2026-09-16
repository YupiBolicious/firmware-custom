import { Sun, Moon } from 'lucide-react';
import NotificationBell from '../NotificationBell';

export default function Topbar({ theme, toggleTheme, currentPage }) {
  return (
    <header className="topbar">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span className="breadcrumb-root">workspace</span>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{currentPage}</span>
      </nav>

      <div className="topbar-actions">
        <button
          className="notif-bell"
          onClick={toggleTheme}
          aria-label={
            theme === 'dark'
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? (
            <Sun size={18} strokeWidth={1.5} />
          ) : (
            <Moon size={18} strokeWidth={1.5} />
          )}
        </button>

        <NotificationBell />
      </div>
    </header>
  );
}