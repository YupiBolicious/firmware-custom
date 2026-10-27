import { useValueToast } from '../components/Toast';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RelativeTime from '../components/RelativeTime';
import useCoderDashboard from './useCoderDashboard';
import FilterSearch from './FilterSearch';
import StatusBadge from '../components/StatusBadge';
import WoDashboardList, { DASHBOARD_WO_COLUMNS } from './WoDashboardList';
import useDashboardWoList from './useDashboardWoList';

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
    data, error, loading,
    filters, showAdvanced, setShowAdvanced, setFilter, clearFilters,
    filteredReviewQueue, filteredWorkQueue, dashboardKpis, filteredWorkload, filteredTrend,
    matchingCount, totalCount, hasActiveFilters,
    uniqueComplexities, uniqueModels, CLASSIFICATION_STATUS_LABELS,
    workOrderQueue, workOrderQueueTotal, workOrderQueueTotalPages,
    workOrderPage, setWorkOrderPage,
  } = useCoderDashboard();
  useValueToast(error);
  const workOrders = useDashboardWoList({
    rows: workOrderQueue,
    total: workOrderQueueTotal,
    page: workOrderPage,
    setPage: setWorkOrderPage,
    totalPages: workOrderQueueTotalPages,
    hasActiveFilters,
  });

  const navigate = useNavigate();

  const showInProgress=()=>{
    navigate('/review-queue');
  };
  const showCompleted= () =>{
    navigate('/work-orders');
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Dashboard unavailable.</div>;
  if (!data) return null;

  const allQueue = data?.work_queue || [];
  const globalDone = allQueue.filter((r) => ['CLASSIFIED', 'NON_FIRMWARE'].includes(r.classification_status)).length;
  const globalOpen = allQueue.filter((r) => r.classification_status === 'CODER_REVIEW').length;
  const myWorkOrders = data.my_work_orders || [];
  return (
    <div className='dashboard coder-dashboard'>
      {/* User KPI card*/}
      <div className="stats-grid mb-10">
        <button type='button' className='stat' onClick={showInProgress} aria-label={`View ${dashboardKpis.pending_review}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color:dashboardKpis.pending_review > 0 ? 'var(--warning)' : undefined, width:'100%'}}
        >
          <div className='label'>Items Waiting for Review</div>
          <div className='value'>{dashboardKpis.pending_review}</div>
        </button>

        <button type='button' className='stat' onClick={showInProgress} aria-label={`View ${globalDone}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color: globalDone> 0 ? 'var(--success)' : undefined, width:'100%'}}
        >
          <div className='label'>Items Completed</div>
          <div className='value'>{globalDone}</div>
        </button>
       
        <button type='button' className='stat' onClick={showCompleted} aria-label={`View ${dashboardKpis.overdue}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color: dashboardKpis.overdue > 0 ? 'var(--danger)' : undefined, width:'100%'}}
        >
          <div className='label'>Overdue Review</div>
          <div className='value'>{dashboardKpis.overdue}</div>
        </button>
    
        <button type='button' className='stat' onClick={showCompleted} aria-label={`View ${dashboardKpis.completed}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color: dashboardKpis.completed > 0 ? 'var(--success)' : undefined, width:'100%'}}
        >
          <div className='label'>Completed Work Orders</div>
          <div className='value'>{dashboardKpis.completed}</div>
        </button>
      </div>
      <div className='stats-grid'>
          <div className="stat">
            <div className="label">Pending Hours</div>
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

      {/* Work orders assigned to the logged-in coder */}
      <div className="panel mb-16">
        <h3 className="mb-16">
          Assigned to Me
          {myWorkOrders.length > 0 && (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              {myWorkOrders.length} assigned
            </span>
          )}
        </h3>
        {myWorkOrders.length === 0 ? (
          <div className="text-muted">No work orders assigned to you.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Work Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Open Items</th>
                  <th>Hours</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {myWorkOrders.map((w) => (
                  <tr key={w.id}>
                    <td><Link to={`/work-orders/${w.id}`}><strong>{w.wo_number}</strong></Link></td>
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
        )}
      </div>
      <WoDashboardList
        rows={workOrders.rows}
        total={workOrders.total}
        page={workOrders.page}
        totalPages={workOrders.totalPages}
        onPageChange={workOrders.setPage}
        columns={DASHBOARD_WO_COLUMNS}
        hasActiveFilters={workOrders.hasActiveFilters}
        filterControls={
          <FilterSearch
            filters={filters}
            setFilter={setFilter}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            clearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            uniqueComplexities={uniqueComplexities}
            uniqueModels={uniqueModels}
            modelValueField='id'
          />
        }
      />
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
            <Link to="/review-queue" className="btn btn-secondary">Review</Link>
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
                    {[r.machine_model_code, r.serial_number ? `SN: ${r.serial_number}` : null].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td>{r.quantity}</td>
                  <td>{r.confidence_score != null ? `${r.confidence_score}%` : '-'}</td>
                  <td>{r.complexity_code || <span className="badge badge-warning">Pending</span>}</td>
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
        <h3 className="mb-16">Workload</h3>
        {filteredTrend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredTrend} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="28%" barGap={3}>
              <defs>
                <linearGradient id="coderQueued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-coder-queued-top" />
                  <stop offset="100%" className="chart-stop-coder-queued-bot" />
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

    </div>
  );

}
