import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/dashboard');
        setStats(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      }
    };
    load();
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat">
          <div className="label">Total Work Orders</div>
          <div className="value">{stats.total_work_orders}</div>
        </div>
        <div className="stat">
          <div className="label">Total Items</div>
          <div className="value">{stats.total_items}</div>
        </div>
        <div className="stat">
          <div className="label">Classified Items</div>
          <div className="value">{stats.classified_items}</div>
        </div>
        <div className="stat">
          <div className="label">Waiting for Review</div>
          <div className="value">{stats.waiting_review}</div>
        </div>
        <div className="stat">
          <div className="label">Total Estimated Hours</div>
          <div className="value">{stats.total_estimated_hours}</div>
        </div>
      </div>
      <div className="panel">
        <h3>Quick Actions</h3>
        <Link className="btn" to="/work-orders/new">Create Work Order</Link>
        <Link className="btn btn-secondary" to="/work-orders" style={{ marginLeft: 8 }}>View Work Orders</Link>
      </div>
    </div>
  );
}