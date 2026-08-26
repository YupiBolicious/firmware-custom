import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CoderDashboard from './pages/CoderDashboard';
import WorkOrderList from './pages/WorkOrderList';
import WorkOrderCreate from './pages/WorkOrderCreate';
import WorkOrderDetail from './pages/WorkOrderDetail';
import ComplexityLevels from './pages/ComplexityLevels';
import ReviewQueue from './pages/ReviewQueue';
import KnowledgeBase from './pages/KnowledgeBase';

export default function App() {
  const { user, hasRole } = useAuth();

  const DashboardPage = hasRole('CODER') ? CoderDashboard : Dashboard;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route element={<RoleRoute roles={['PM', 'CODER']} />}>
          <Route path="/work-orders" element={<WorkOrderList />} />
        </Route>
        <Route element={<RoleRoute roles={['PM']} />}>
          <Route path="/work-orders/new" element={<WorkOrderCreate />} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderCreate />} />
        </Route>
        <Route element={<RoleRoute roles={['PM', 'CODER']} />}>
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        </Route>
        <Route path="/complexity-levels" element={<ComplexityLevels />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route element={<RoleRoute roles={['CODER']} />}>
          <Route path="/review-queue" element={<ReviewQueue />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}