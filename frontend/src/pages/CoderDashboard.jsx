import { useValueToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RelativeTime from '../components/RelativeTime';
import useCoderDashboard from './useCoderDashboard';
import FilterSearch from './FilterSearch';
import StatusBadge from '../components/StatusBadge';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color || entry.payload?.fill }}>
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
    coderActivity, newWorkOrders,
    activityPage, setActivityPage, newWoPage, setNewWoPage,
    workOrderQueue, workOrderQueueTotal, workOrderQueueTotalPages,
    workOrderPage, setWorkOrderPage,
    coderActivityTotalPages, newWorkOrdersTotalPages,
    CLASSIFICATION_STATUS_LABELS,
  } = useCoderDashboard();
  useValueToast(error);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Dashboard unavailable.</div>;
  if (!data) return null;

  const allQueue = data?.work_queue || [];
  const globalDone = allQueue.filter((r) => ['CLASSIFIED', 'NON_FIRMWARE'].includes(r.classification_status)).length;
  const globalOpen = allQueue.filter((r) => r.classification_status === 'CODER_REVIEW').length;

  return (
    <div className='dashboard'>
      

      {/* 1. Personal KPI Summary */}
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
      
      {/* 3. Workload + Overall Progress */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload</h3>
        <div className="stats-grid">
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
        <h3 className="mt-16 mb-16">Overall Progress</h3>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Items Completed</div>
            <div className="value" style={{ color: 'var(--success)' }}>{globalDone}</div>
          </div>
          <div className="stat">
            <div className="label">Items Open</div>
            <div className="value" style={{ color: globalOpen > 0 ? 'var(--warning)' : undefined }}>{globalOpen}</div>
          </div>
        </div>
      </div>

      {/* 4. Work Orders */}
      <div className="panel mb-16">
        <h3 className="mb-16">
          Work Orders
          {workOrderQueueTotal > 0 && (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              {workOrderQueueTotal} total
            </span>
          )}
        </h3>
        <FilterSearch
          filters={filters}
          setFilter={setFilter}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          uniqueComplexities={uniqueComplexities}
          classificationLabels={CLASSIFICATION_STATUS_LABELS}
        />
        {workOrderQueue.length === 0 ? (
          <div className="text-muted">{hasActiveFilters ? 'No work orders match the current filters.' : 'No work orders yet.'}</div>
        ) : (
          <>
            <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Work Order</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Open Items</th>
                  <th>Hours</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {workOrderQueue.map((w) => (
                  <tr key={w.id}>
                    <td><Link to={`/work-orders/${w.id}`}><strong>{w.wo_number}</strong></Link></td>
                    <td>{w.title || '-'}</td>
                    <td className="text-muted">{w.customer || '-'}</td>
                    <td><StatusBadge status={w.status} /></td>
                    <td>
                      {w.open_count > 0 ? (
                        <span className="badge badge-warning">{w.open_count} of {w.item_count}</span>
                      ) : (
                        <span className="text-muted">{w.done_count}/{w.item_count}</span>
                      )}
                    </td>
                    <td>{w.total_hours > 0 ? `${Number(w.total_hours).toFixed(1)}h` : '-'}</td>
                    <td className="text-muted">{w.last_activity ? <RelativeTime date={w.last_activity} /> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {workOrderQueueTotalPages > 1 && (
              <div className="flex justify-between align-center" style={{ marginTop: 12 }}>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Page {workOrderPage} of {workOrderQueueTotalPages}
                </span>
                <div className="flex gap-8">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setWorkOrderPage(workOrderPage - 1)}
                    disabled={workOrderPage <= 1}
                  >
                    Prev
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setWorkOrderPage(workOrderPage + 1)}
                    disabled={workOrderPage >= workOrderQueueTotalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. Review Queue */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3>
            Review Queue
            {hasActiveFilters && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
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
          <div className="table-scroll">
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
          </div>
        )}
      </div>


      {/* 6. Workload Trend */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload Trend (8 Weeks)</h3>
        {filteredTrend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredTrend} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="28%" barGap={3}>
              <defs>
                <linearGradient id="coderQueued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-queued-top" />
                  <stop offset="100%" className="chart-stop-queued-bot" />
                </linearGradient>
                <linearGradient id="coderDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-done-top" />
                  <stop offset="100%" className="chart-stop-done-bot" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={(d) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
                stroke="var(--chart-axis)"
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                fontSize={12}
              />
              <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="items_queued" name="Queued" fill="url(#coderQueued)" stackId="workload" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="items_completed" name="Completed" fill="url(#coderDone)" stackId="workload" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 7. Recent Activity & New Work Orders — side by side */}
      <div className="split-2">
        <div className="panel panel-accent-amber">
          <h3 className="mb-16">Recent Activity</h3>
          {coderActivity.length === 0 ? (
            <div className="text-muted">No recent coder activity.</div>
          ) : (
            <>
              <div className="table-scroll table-scroll--fit">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>User</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {coderActivity.map((a) => (
                    <tr key={a.id}>
                      <td>{formatAction(a.action, a.details)}</td>
                      <td>{a.user_name}</td>
                      <td className="text-muted"><RelativeTime date={a.created_at} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {coderActivityTotalPages > 1 && (
                <div className="flex justify-between align-center" style={{ marginTop: 12 }}>
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Page {activityPage} of {coderActivityTotalPages}
                  </span>
                  <div className="flex gap-8">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActivityPage(activityPage - 1)}
                      disabled={activityPage <= 1}
                    >
                      Prev
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActivityPage(activityPage + 1)}
                      disabled={activityPage >= coderActivityTotalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel panel-accent-green">
          <h3 className="mb-16">New Work Orders</h3>
          {newWorkOrders.length === 0 ? (
            <div className="text-muted">No new work orders.</div>
          ) : (
            <>
              <div className="table-scroll table-scroll--fit">
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
                  {newWorkOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td><strong>{wo.details?.wo_number || '-'}</strong></td>
                      <td>{wo.details?.title || '-'}</td>
                      <td>{wo.user_name}</td>
                      <td className="text-muted"><RelativeTime date={wo.created_at} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {newWorkOrdersTotalPages > 1 && (
                <div className="flex justify-between align-center" style={{ marginTop: 12 }}>
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Page {newWoPage} of {newWorkOrdersTotalPages}
                  </span>
                  <div className="flex gap-8">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setNewWoPage(newWoPage - 1)}
                      disabled={newWoPage <= 1}
                    >
                      Prev
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setNewWoPage(newWoPage + 1)}
                      disabled={newWoPage >= newWorkOrdersTotalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

}
