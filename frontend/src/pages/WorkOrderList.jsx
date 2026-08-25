import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function WorkOrderList() {
  const { hasRole } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/work-orders');
        setWorkOrders(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load work orders');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="flex justify-between align-center mb-16">
        <h1>Work Orders</h1>
        {hasRole('PM') && <Link className="btn" to="/work-orders/new">Create Work Order</Link>}
      </div>
      {workOrders.length === 0 ? (
        <div className="panel text-muted">No work orders yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>WO Number</th>
              <th>Title</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Items</th>
              <th>Total Est. Hours</th>
              <th>Created By</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((wo) => (
              <tr key={wo.id}>
                <td><Link to={`/work-orders/${wo.id}`}>{wo.wo_number}</Link></td>
                <td>{wo.title}</td>
                <td>{wo.customer || '-'}</td>
                <td><span className="badge badge-info">{wo.status}</span></td>
                <td>{wo.item_count}</td>
                <td>{wo.total_estimated_hours}</td>
                <td>{wo.created_by_name || '-'}</td>
                <td>{new Date(wo.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}