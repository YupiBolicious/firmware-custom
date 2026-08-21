import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkOrderList from './pages/WorkOrderList';
import WorkOrderCreate from './pages/WorkOrderCreate';
import WorkOrderDetail from './pages/WorkOrderDetail';
import ComplexityLevels from './pages/ComplexityLevels';

export default function App() {
  const { user } = useAuth();

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/work-orders" element={<WorkOrderList />} />
        <Route path="/work-orders/new" element={<WorkOrderCreate />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="/complexity-levels" element={<ComplexityLevels />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}