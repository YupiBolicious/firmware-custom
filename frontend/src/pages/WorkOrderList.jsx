import { useValueToast } from '../components/Toast';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function WorkOrderList() {
  const { hasRole } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  useValueToast(error);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        // server rendered
        const res = await api.get('/work-orders', { params: { page } });
        setWorkOrders(res.data.data.items);
        setTotal(res.data.data.total);
        setPageSize(res.data.data.limit);
        setTotalPages(res.data.data.totalPages);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load work orders');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Work order list unavailable.</div>;

  const itemCount = workOrders.length;
  const from = itemCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = itemCount > 0 ? Math.min(page * pageSize, total) : 0;

  return (
    <div className="glass-page wo-glass">
      <div className="page-head">
        <div>
          <h1>
            Work Orders
            <span className="wo-count-pill">{total} entries</span>
          </h1>
        </div>
        {hasRole('PM') && (
          <Link className="btn wo-create-btn" to="/work-orders/new">Create Work Order</Link>
        )}
      </div>
      {workOrders.length === 0 ? (
        <div className="panel text-muted">No work orders yet.</div>
      ) : (
        <>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WO Number</th>
                <th>Model</th>
                <th>Title</th>
                <th>Customer</th>
                <th className="text-center">Status</th>
                <th className="text-center">Items</th>
                <th className="text-right">Total Est. Hours</th>
                <th>Created By</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id}>
                  <td className="num"><Link className="wo-link" to={`/work-orders/${wo.id}`}>{wo.wo_number}</Link></td>
                  <td className="meta"><span className="wo-model-chip">{wo.group_summary || '-'}</span></td>
                  <td className="title-cell">{wo.title || '-'}</td>
                  <td className="meta">{wo.customer || '-'}</td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td className="num text-center">{wo.item_count}</td>
                  <td className="num text-right">{Number(wo.total_estimated_hours).toFixed(2)} h</td>
                  <td className="meta">{wo.created_by_name || '-'}</td>
                  <td className="meta">{new Date(wo.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wo-table-footer">
          <span>
            Showing <strong>{from}-{to}</strong> of <strong>{total}</strong> work orders
          </span>
          <div className="wo-page-nav">
            <button className="wo-page-btn" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
            <button className="wo-page-btn" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}