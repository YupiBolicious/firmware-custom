import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RelativeTime from '../components/RelativeTime';
import useCoderDashboard from './useCoderDashboard';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 4, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value} items ({entry.dataKey.includes('queued') ? entry.payload.hours_queued : entry.payload.hours_completed}h)
        </div>
      ))}
    </div>
  );
}

export default function CoderDashboard() {
  const { data, error, loading, formatAction } = useCoderDashboard();

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { kpis, review_queue, work_queue, workload, coder_activity, new_work_orders, trend } = data;

  return (
    <div>
      <h1>Coder Dashboard</h1>

      {/* 1. KPI Summary */}
      <div className="stats-grid mb-16">
        <div className="stat">
          <div className="label">Pending Review</div>
          <div className="value" style={{ color: kpis.pending_review > 0 ? 'var(--warning)' : undefined }}>
            {kpis.pending_review}
          </div>
        </div>
        <div className="stat">
          <div className="label">In Queue (Hours)</div>
          <div className="value">{kpis.pending_hours.toFixed(1)}h</div>
        </div>
        <div className="stat">
          <div className="label">Completed</div>
          <div className="value" style={{ color: 'var(--success)' }}>{kpis.completed}</div>
        </div>
        <div className="stat">
          <div className="label">Completed Hours</div>
          <div className="value">{kpis.completed_hours.toFixed(1)}h</div>
        </div>
        {kpis.overdue > 0 && (
          <div className="stat">
            <div className="label">Overdue</div>
            <div className="value" style={{ color: 'var(--danger)' }}>{kpis.overdue}</div>
          </div>
        )}
      </div>

      {/* 2. Review Queue */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3>Review Queue</h3>
          {review_queue.length > 0 && (
            <Link to="/review-queue" className="btn btn-sm">Review All</Link>
          )}
        </div>
        {review_queue.length === 0 ? (
          <div className="text-muted">No items awaiting review.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>WO</th>
                <th>Custom Item</th>
                <th>Qty</th>
                <th>Confidence</th>
                <th>Complexity</th>
                <th>Hours</th>
                <th>Waiting</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {review_queue.map((r) => (
                <tr key={r.item_id}>
                  <td><Link to={`/work-orders/${r.work_order_id}`}>{r.wo_number}</Link></td>
                  <td>{r.title}</td>
                  <td>{r.quantity}</td>
                  <td>{r.confidence_score != null ? `${r.confidence_score}%` : '-'}</td>
                  <td>{r.complexity_code || <span className="badge badge-warning">Unassigned</span>}</td>
                  <td>{r.estimated_hours > 0 ? `${r.estimated_hours}h` : '-'}</td>
                  <td><RelativeTime date={r.created_at} /></td>
                  <td><Link to="/review-queue" className="btn btn-sm">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Work Queue + Workload */}
      <div className="panel mb-16">
        <h3 className="mb-16">Work Queue</h3>
        {work_queue.length === 0 ? (
          <div className="text-muted">No active work items.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>WO</th>
                <th>Custom Item</th>
                <th>Qty</th>
                <th>Complexity</th>
                <th>Hours</th>
                <th>WO Status</th>
                <th>Class. Status</th>
              </tr>
            </thead>
            <tbody>
              {work_queue.map((r) => (
                <tr key={r.item_id}>
                  <td><Link to={`/work-orders/${r.work_order_id || ''}`}>{r.wo_number}</Link></td>
                  <td>{r.title}</td>
                  <td>{r.quantity}</td>
                  <td>{r.complexity_code || '-'}</td>
                  <td>{r.estimated_hours > 0 ? `${r.estimated_hours}h` : '-'}</td>
                  <td>
                    <span className={`badge ${r.work_order_status === 'FINALIZED' ? 'badge-success' : r.work_order_status === 'ANALYZED' ? 'badge-info' : 'badge-muted'}`}>
                      {r.work_order_status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.classification_status === 'CLASSIFIED' ? 'badge-success' : r.classification_status === 'NON_FIRMWARE' ? 'badge-muted' : 'badge-warning'}`}>
                      {r.classification_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="stats-grid mt-16">
          <div className="stat">
            <div className="label">Queued Hours</div>
            <div className="value">{workload.queued_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">In Progress Hours</div>
            <div className="value">{workload.in_progress_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Completed Hours</div>
            <div className="value" style={{ color: 'var(--success)' }}>{workload.completed_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Total Hours</div>
            <div className="value">{(workload.queued_hours + workload.in_progress_hours + workload.completed_hours).toFixed(1)}h</div>
          </div>
        </div>
      </div>

      {/* 4. Coder Activity */}
      <div className="panel mb-16">
        <h3 className="mb-16">Recent Activity</h3>
        {coder_activity.length === 0 ? (
          <div className="text-muted">No recent coder activity.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {coder_activity.map((a) => (
                <tr key={a.id}>
                  <td>{formatAction(a.action, a.details)}</td>
                  <td>{a.user_name}</td>
                  <td className="text-muted"><RelativeTime date={a.created_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. New Work Orders */}
      <div className="panel mb-16">
        <h3 className="mb-16">New Work Orders</h3>
        {new_work_orders.length === 0 ? (
          <div className="text-muted">No new work orders.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Title</th>
                <th>Created By</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {new_work_orders.map((wo) => (
                <tr key={wo.id}>
                  <td><strong>{wo.details?.wo_number || '-'}</strong></td>
                  <td>{wo.details?.title || '-'}</td>
                  <td>{wo.user_name}</td>
                  <td className="text-muted"><RelativeTime date={wo.created_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 6. Workload Trend */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload Trend (8 Weeks)</h3>
        {trend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
              <XAxis
                dataKey="week"
                tickFormatter={(d) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
                stroke="#9a9a9a"
                fontSize={12}
              />
              <YAxis stroke="#9a9a9a" fontSize={12} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="items_queued" name="Queued" fill="#ff9800" stackId="workload" />
              <Bar dataKey="items_completed" name="Completed" fill="#4caf50" stackId="workload" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
