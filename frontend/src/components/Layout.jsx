import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import {Menu, LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  Settings,
  BookOpen,
  List, Lock, LogOut, Users} from 'lucide-react';

const NAV_ITEMS = [
  {
    
    to: '/dashboard',
    label: 'Dashboard',
    roles: ['ADMIN', 'PM', 'CODER'],
    icon: <LayoutDashboard size={16} strokeWidth={1.5} />,
  },
  {
    to: '/work-orders',
    label: 'Work Orders',
    roles: ['PM', 'CODER', 'ADMIN'],
    icon: <ClipboardList size={16} strokeWidth={1.5} />,
  },
  {
    to: '/review-queue',
    label: 'Review Queue',
    roles: ['CODER'],
    icon: <ClipboardCheck size={16} strokeWidth={1.5} />,
  },
  {
    to: '/complexity-levels',
    label: 'Complexity Levels',
    roles: ['ADMIN'],
    icon: <BarChart3 size={16} strokeWidth={1.5} />,
  },
  {
    to: '/machine-models',
    label: 'Machine Models',
    roles: ['ADMIN'],
    icon: <Settings size={16} strokeWidth={1.5} />,
  },
  {
    to: '/users',
    label: 'Users',
    roles: ['ADMIN'],
    icon: <Users size={16} strokeWidth={1.5} />,
  },
  {
    to: '/knowledge-base',
    label: 'Knowledge Base',
    roles: ['ADMIN'],
    icon: <BookOpen size={16} strokeWidth={1.5} />,
  },
  {
    to: '/audit-log',
    label: 'Audit Log',
    roles: ['ADMIN', 'PM', 'CODER'],
    icon: <List size={16} strokeWidth={1.5} />,
  },
  {
    to: '/change-password',
    label: 'Change Password',
    roles: ['ADMIN', 'PM', 'CODER'],
    icon: <Lock size={16} strokeWidth={1.5} />,
  },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles));

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
       <div className="sidebar-header">
      <div className="brand">
        {collapsed ? 'FC' : 'Firmware Custom'}
      </div>

      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-label="Toggle sidebar"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Menu size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
        <nav>
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user-info">
          <div className="user-info-row">
            <div className="user-name">
              {collapsed ? user?.full_name?.split(' ')[0] : user?.full_name}
            </div>
            <button
              className="logout-btn"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
          {!collapsed && <div>{user?.roles?.join(', ')}</div>}
        </div>
      </aside>
      <main className="main">
        <header className="app-header">
          <NotificationBell />
        </header>
        <Outlet />
      </main>
    </div>
  );
}