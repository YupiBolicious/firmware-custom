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
  const {
    data, error, loading, formatAction,
    filters, showAdvanced, setShowAdvanced, setFilter, clearFilters,
    filteredReviewQueue, filteredWorkQueue, filteredKpis, filteredWorkload, filteredTrend,
    matchingCount, totalCount, hasActiveFilters,
    uniqueComplexities,
    CLASSIFICATION_STATUS_LABELS, WORK_ORDER_STATUS_LABELS,
  } = useCoderDashboard();

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <h1>Firmware Engineer Dashboard</h1>

      {/* 1. KPI Summary */}
      <div className="stats-grid mb-16">
        <div className="stat">
          <div className="label">Items Pending Review</div>
          <div className="value" style={{ color: filteredKpis.pending_review > 0 ? 'var(--warning)' : undefined }}>
            {filteredKpis.pending_review}
          </div>
        </div>
        <div className="stat">
          <div className="label">Items In Queue (Hours)</div>
          <div className="value">{filteredKpis.pending_hours.toFixed(1)}h</div>
        </div>
        <div className="stat">
          <div className="label">Items Completed</div>
          <div className="value" style={{ color: 'var(--success)' }}>{filteredKpis.completed}</div>
        </div>
        <div className="stat">
          <div className="label">Total Completed Hours</div>
          <div className="value">{filteredKpis.completed_hours.toFixed(1)}h</div>
        </div>
        {filteredKpis.overdue > 0 && (
          <div className="stat">
            <div className="label">Overdue</div>
            <div className="value" style={{ color: 'var(--danger)' }}>{filteredKpis.overdue}</div>
          </div>
        )}
      </div>

      {/* Search & Filter Controls */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-8">
          <h3 style={{ margin: 0 }}>
            Filters
            {hasActiveFilters && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                {matchingCount} of {totalCount} shown
              </span>
            )}
          </h3>
          <div className="flex gap-8">
            {hasActiveFilters && (
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear Filters</button>
            )}
          </div>
        </div>

        <div className="flex gap-8 mb-8">
          <input
            style={{ flex: 1, padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#e0e0e0', fontSize: 13 }}
            placeholder="Search WO number, item title, item number..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
          <button
            className={`btn btn-sm ${showAdvanced ? '' : 'btn-secondary'}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Filters {showAdvanced ? '\u25B2' : '\u25BC'}
          </button>
        </div>

        {showAdvanced && (
          <div style={{ padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333', marginBottom: 12 }}>
            <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Complexity</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.complexityFilter}
                  onChange={(e) => setFilter('complexityFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {uniqueComplexities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {/* <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Confidence Min %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.confidenceMin}
                  onChange={(e) => setFilter('confidenceMin', e.target.value)}
                />
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Confidence Max %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="100"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.confidenceMax}
                  onChange={(e) => setFilter('confidenceMax', e.target.value)}
                />
              </div> */}
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Classification Status</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.classificationStatusFilter}
                  onChange={(e) => setFilter('classificationStatusFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {Object.entries(CLASSIFICATION_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Work Order Status</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.workOrderStatusFilter}
                  onChange={(e) => setFilter('workOrderStatusFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>From</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.dateFrom}
                  onChange={(e) => setFilter('dateFrom', e.target.value)}
                />
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>To</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.dateTo}
                  onChange={(e) => setFilter('dateTo', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Review Queue */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3>
            Review Queue
            {hasActiveFilters && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                {filteredReviewQueue.length} shown
              </span>
            )}
          </h3>
          {data.review_queue.length > 0 && (
            <Link to="/review-queue" className="btn btn-sm">Review</Link>
          )}
        </div>
        {filteredReviewQueue.length === 0 ? (
          <div className="text-muted">{hasActiveFilters ? 'No review items match the current filters.' : 'No items awaiting review.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work Orders</th>
                <th>Custom Item</th>
                <th>Model / Unit</th>
                <th>Qty</th>
                <th>Confidence</th>
                <th>Complexity</th>
                <th>Hours</th>
                <th>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviewQueue.map((r) => (
                <tr key={r.item_id}>
                  <td><Link to={`/work-orders/${r.work_order_id}`}>{r.wo_number}</Link></td>
                  <td>{r.title}</td>
                  <td>
                    {[r.machine_model_code, r.machine_model_version, r.serial_number ? `SN: ${r.serial_number}` : null].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td>{r.quantity}</td>
                  <td>{r.confidence_score != null ? `${r.confidence_score}%` : '-'}</td>
                  <td>{r.complexity_code || <span className="badge badge-warning">Unassigned</span>}</td>
                  <td>{r.estimated_hours > 0 ? `${r.estimated_hours}h` : '-'}</td>
                  <td><RelativeTime date={r.created_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Work Queue + Workload */}
      <div className="panel mb-16">
        <h3 className="mb-16">
          Work Queue
          {hasActiveFilters && (
            <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
              {filteredWorkQueue.length} shown
            </span>
          )}
        </h3>
        {filteredWorkQueue.length === 0 ? (
          <div className="text-muted">{hasActiveFilters ? 'No work items match the current filters.' : 'No active work items.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work Orders</th>
                <th>Custom Item</th>
                <th>Model / Ver</th>
                <th>Serial Number</th>
                <th>Qty</th>
                <th>Complexity</th>
                <th>Hours</th>
                <th>Work Order Status</th>
                <th>Classification Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkQueue.map((r) => (
                <tr key={r.item_id}>
                  <td><Link to={`/work-orders/${r.work_order_id || ''}`}>{r.wo_number}</Link></td>
                  <td>{r.title}</td>
                  <td>{[r.machine_model_code, r.machine_model_version].filter(Boolean).join(' / ') || '-'}</td>
                  <td>{[r.serial_number ? `SN: ${r.serial_number}` : '-'].filter(Boolean).join(' ')}</td>
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
            <div className="value">{filteredWorkload.queued_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">In Progress Hours</div>
            <div className="value">{filteredWorkload.in_progress_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Completed Hours</div>
            <div className="value" style={{ color: 'var(--success)' }}>{filteredWorkload.completed_hours.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Total Hours</div>
            <div className="value">{(filteredWorkload.queued_hours + filteredWorkload.in_progress_hours + filteredWorkload.completed_hours).toFixed(1)}h</div>
          </div>
        </div>
      </div>

      

      {/* 6. Workload Trend */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload Trend (8 Weeks)</h3>
        {filteredTrend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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

      {/* 4+5. Recent Activity & New Work Orders — side by side */}
      <div className="split-2">
        <div className="panel panel-accent-amber">
          <h3 className="mb-16">Recent Activity</h3>
          {data.coder_activity.length === 0 ? (
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
                {data.coder_activity.map((a) => (
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

        <div className="panel panel-accent-green">
          <h3 className="mb-16">New Work Orders</h3>
          {data.new_work_orders.length === 0 ? (
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
                {data.new_work_orders.map((wo) => (
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
      </div>
    </div>
  );

}
