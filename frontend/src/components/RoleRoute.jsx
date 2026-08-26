import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const allowed = roles.some((role) => user?.roles?.includes(role));

  if (!allowed) {
    return <Navigate to={user?.roles?.includes('CODER') ? '/' : '/'} replace />;
  }

  return children || <Outlet />;
}
