import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CoderDashboard from './pages/CoderDashboard';
import PMDashboard from './pages/PMDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PlaceholderPage from './pages/PlaceholderPage';
import WorkOrderList from './pages/WorkOrderList';
import WorkOrderCreate from './pages/WorkOrderCreate';
import WorkOrderDetail from './pages/WorkOrderDetail';
import ComplexityLevels from './pages/ComplexityLevels';
import ReviewQueue from './pages/ReviewQueue';
import MachineModels from './pages/MachineModels';
import KnowledgeBase from './pages/KnowledgeBase';
import AuditLog from './pages/AuditLog';
import UserManagement from './pages/UserManagement';
import ChangePassword from './pages/ChangePassword';

export default function App() {
  const { user, hasRole } = useAuth();

  const DashboardPage = hasRole('CODER') ? CoderDashboard
                    : hasRole('PM')     ? PMDashboard
                    : hasRole('ADMIN')  ? AdminDashboard
                    :                     Dashboard;

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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route element={<RoleRoute roles={['PM', 'CODER', 'ADMIN']} />}>
          <Route path="/work-orders" element={<WorkOrderList />} />
        </Route>
        <Route element={<RoleRoute roles={['PM']} />}>
          <Route path="/work-orders/new" element={<WorkOrderCreate />} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderCreate />} />
        </Route>
        <Route element={<RoleRoute roles={['PM', 'CODER', 'ADMIN']} />}>
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        </Route>
        <Route path="/complexity-levels" element={<ComplexityLevels />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route element={<RoleRoute roles={['CODER']} />}>
          <Route path="/review-queue" element={<ReviewQueue />} />
        </Route>
        <Route element={<RoleRoute roles={['ADMIN', 'PM', 'CODER']} />}>
          <Route path="/audit-log" element={<AuditLog />} />
        </Route>
        <Route element={<RoleRoute roles={['ADMIN']} />}>
          <Route path="/machine-models" element={<MachineModels />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/classification-rules" element={<PlaceholderPage title="Classification Rules" />} />
          <Route path="/confidence-thresholds" element={<PlaceholderPage title="Confidence Thresholds" />} />
          <Route path="/fw-modules" element={<PlaceholderPage title="FW Modules" />} />
        </Route>
        <Route path="/change-password" element={<ChangePassword />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}