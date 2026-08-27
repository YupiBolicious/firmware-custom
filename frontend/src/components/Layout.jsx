import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Firmware Custom</div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          {hasRole('PM', 'CODER') && <NavLink to="/work-orders">Work Orders</NavLink>}
          {hasRole('CODER') && <NavLink to="/review-queue">Review Queue</NavLink>}
          {hasRole('ADMIN') && <NavLink to="/complexity-levels">Complexity Levels</NavLink>}
          {hasRole('ADMIN') && <NavLink to="/machine-models">Machine Models</NavLink>}
          {hasRole('ADMIN') && <NavLink to="/knowledge-base">Knowledge Base</NavLink>}
        </nav>
        <div className="user-info">
          <div>{user?.full_name}</div>
          <div>{user?.roles?.join(', ')}</div>
          <button className="btn btn-secondary btn-sm mt-8" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}