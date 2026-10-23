import { useState } from 'react';
import { useValueToast } from '../components/Toast';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Sun, Moon } from 'lucide-react';
import RelativeTime from '../components/RelativeTime';
import usePmDashboard from './usePmDashboard';
import FilterSearch from './FilterSearch';
import StatusBadge from '../components/StatusBadge';
import WoDashboardList from './WoDashboardList';

const STATUS_COLORS = {
  DRAFT: 'var(--text-muted)',
  ANALYZED: 'var(--production)',
  FINALIZED: 'var(--warning)',
  PRODUCTION: 'var(--info)',
  COMPLETED: 'var(--success)',
};

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color || entry.payload?.fill }}>
          {entry.name}: {entry.value}h
        </div>
      ))}
    </div>
  );
}

function formatAttentionAge(hours, kind) {
  const label = kind === 'coder_review' ? 'Oldest review' : kind === 'production_followup' ? 'Oldest open task' : 'Inactive';
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const duration = days > 0 ? `${days}d ${remainingHours}h` : `${hours}h`;
  return `${label}: ${duration}`;
}

export default function PMDashboard() {
  const {
    data, error, loading, formatStatus,
    filters, showAdvanced, setShowAdvanced, setFilter, clearFilters,
    filteredQueue, matchingCount, hasActiveFilters,
    visibleQueue, queuePage, setQueuePage, queueTotalPages,
    uniqueModels, uniqueVersions, uniqueComplexities,
    filteredKpis, filteredStatusDistribution, filteredWorkload, filteredTrend, trendUnit, trendWindow, filteredAttention,
  } = usePmDashboard();
  useValueToast(error);
  const navigate = useNavigate();
  const showInProgress = () => navigate('/work-orders');
  const workOrderColumns = [
    {
      key: 'work-order',
      label: 'WO Number',
      render: (workOrder) => (
        <Link to={`/work-orders/${workOrder.id}`}><strong>{workOrder.wo_number}</strong></Link>
      ),
    },
    { key: 'model', label: 'Model', className: 'meta text-muted', render: (workOrder) => workOrder.group_summary || '-' },
    { key: 'customer', label: 'Customer', className: 'meta text-muted', render: (workOrder) => workOrder.customer || '-' },
    { key: 'items', label: 'Items', className: 'num', render: (workOrder) => workOrder.item_count },
    { key: 'status', label: 'Status', render: (workOrder) => <StatusBadge status={workOrder.status} /> },
    {
      key: 'hours',
      label: 'Hours',
      className: 'num',
      render: (workOrder) => Number(workOrder.total_estimated_hours) > 0 ? `${workOrder.total_estimated_hours}h` : '-',
    },
    {
      key: 'progress',
      label: 'Progress',
      render: (workOrder) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
          <div className="progress-track">
            <div style={{ width: `${workOrder.progress}%`, height: '100%', background: workOrder.progress === 100 ? 'var(--success)' : 'var(--info)', borderRadius: 3 }} />
          </div>
          <span className="progress-pct">{workOrder.progress}%</span>
        </div>
      ),
    },
    {
      key: 'updated',
      label: 'Last Update',
      className: 'meta text-muted',
      render: (workOrder) => <RelativeTime date={workOrder.last_activity || workOrder.updated_at} />,
    },
  ];


  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Dashboard unavailable.</div>;
  if (!data) return null;

  const statusTotal = filteredStatusDistribution.reduce((sum, item) => sum + Number(item.count || 0), 0);
  return (
    <div className="dashboard">
      {/* 1. KPI Summary */}
      <div className="stats-grid">
        <button type='button' className='stat' onClick={showInProgress} aria-label={`View ${filteredKpis.completed}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color:filteredKpis.completed> 0 ? 'var(--success)' : undefined, width:'100%', border:0}}
        >
          <div className='label'>Work Order Completed</div>
          <div className='value'>{filteredKpis.completed}</div>
        </button>

        <button type='button' className='stat' onClick={showInProgress} aria-label={`View ${filteredKpis.pending_review}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color:filteredKpis.pending_review> 0 ? 'var(--warning)' : undefined, width:'100%', border:0}}
        >
          <div className='label'>Waiting for Review</div>
          <div className='value'>{filteredKpis.pending_review}</div>
        </button>
        
        <button type='button' className='stat' onClick={showInProgress} aria-label={`View ${filteredKpis.in_progress}`}
        style={{cursor:'pointer', textAlign:'left', font:'inherit', color:filteredKpis.in_progress> 0 ? 'var(--info)' : undefined, width:'100%', border:0}}
        >
          <div className='label'>Work Order in Progress</div>
          <div className='value'>{filteredKpis.in_progress}</div>
        </button>
        <div className="stat">
          <div className="label">Total Est. Hours</div>
          <div className="value">{filteredKpis.total_estimated_hours.toFixed(1)}h</div>
        </div>
        {filteredKpis.overdue > 0 && (
          <div className="stat">
            <div className="label">Overdue</div>
            <div className="value" style={{ color: 'var(--danger)' }}>{filteredKpis.overdue}</div>
          </div>
        )}
      </div>

      {/* 2. Work Queue */}
      <WoDashboardList
        title="Work Queue"
        rows={visibleQueue}
        total={matchingCount}
        page={queuePage}
        totalPages={queueTotalPages}
        onPageChange={setQueuePage}
        columns={workOrderColumns}
        hasActiveFilters={hasActiveFilters}
        filterControls={
          <FilterSearch
            filters={filters}
            setFilter={setFilter}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            clearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            uniqueModels={uniqueModels}
            uniqueVersions={uniqueVersions}
            uniqueComplexities={uniqueComplexities}
          />
        }
      />
      <div className="split-2">
      {/* 3. Progress Overview */}
      <section className="panel status-overview" aria-labelledby="status-overview-title">
        <div className="status-overview-header">
          <div>
            <h3 id="status-overview-title">Progress Overview</h3>
          </div>
        </div>

        {statusTotal === 0 ? (
          <div className="status-overview-empty">No status data for the current filters.</div>
        ) : (
          <>
            <div
              className="status-overview-bar"
              role="img"
              aria-label={`Status distribution across ${statusTotal} work orders`}
            >
              {filteredStatusDistribution.map((item) => {
                const count = Number(item.count) || 0;
                const percent = (count / statusTotal) * 100;
                return count > 0 ? (
                  <span
                    key={item.status}
                    className="status-overview-segment"
                    title={`${formatStatus(item.status)}: ${count} (${Math.round(percent)}%)`}
                    style={{ width: `${percent}%`, background: STATUS_COLORS[item.status] || 'var(--text-muted)' }}
                  />
                ) : null;
              })}
            </div>

            <div className="status-overview-list">
              {filteredStatusDistribution.map((item) => {
                const count = Number(item.count) || 0;
                const percent = Math.round((count / statusTotal) * 100);
                return (
                  <div
                    key={item.status}
                    className="status-overview-row"
                  >
                    <span className="status-overview-name">
                      <span className="status-overview-dot" style={{ background: STATUS_COLORS[item.status] || 'var(--text-muted)' }} />
                      <span>{formatStatus(item.status)}</span>
                    </span>
                    <span className="status-overview-metric">
                      <strong>{count}</strong>
                      <span>{percent}%</span>
                    </span>
                    <span className="status-overview-track" aria-hidden="true">
                      <span style={{ width: `${percent}%`, background: STATUS_COLORS[item.status] || 'var(--text-muted)' }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* 4. Workload / Estimation Overview adjustable later*/}
      <div className="panel">
        <h3 className="mb-16">Workload Overview</h3>
        {(() => {
          const queued = filteredWorkload.queued;
          const inProgress = filteredWorkload.in_progress;
          const completed = filteredWorkload.completed;
          const total = queued + inProgress + completed;
          const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
          return (
            <div className="work-grid">
              <div className="work-card">
                <span className="work-bar" style={{ background: 'var(--text-faint)' }} />
                <div className="work-label">Queued Hours</div>
                <div className="work-value">{queued.toFixed(1)}h</div>
                <div className="work-sub">{queued > 0 ? `${pct(queued)}% pending backlog` : '0 pending backlog'}</div>
              </div>
              <div className="work-card">
                <span className="work-bar" style={{ background: 'var(--accent)' }} />
                <div className="work-label">In Progress Hours</div>
                <div className="work-value">{inProgress.toFixed(1)}h</div>
                <div className="work-sub" style={{ color: 'var(--accent)' }}>{pct(inProgress)}% active burden</div>
              </div>
              <div className="work-card">
                <span className="work-bar" style={{ background: 'var(--success)' }} />
                <div className="work-label">Completed Hours</div>
                <div className="work-value">{completed.toFixed(1)}h</div>
                <div className="work-sub" style={{ color: 'var(--success)' }}>{pct(completed)}% closed-out work</div>
              </div>
              <div className="work-card">
                <span className="work-bar" style={{ background: 'var(--accent)' }} />
                <div className="work-label">Total Hours</div>
                <div className="work-value">{total.toFixed(1)}h</div>
                <div className="work-sub">total estimated hours</div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>

      {/* 5. Workload & Status Trend */}
      <div className="panel">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>Workload & Status Chart</h3>
          {trendWindow && (
            <span className="badge badge-muted">
              {trendWindow.from} → {trendWindow.to}
            </span>
          )}
        </div>
        {filteredTrend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredTrend} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="28%" barGap={3}>
              <defs>
                <linearGradient id="pmQueued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-queued-top" />
                  <stop offset="100%" className="chart-stop-queued-bot" />
                </linearGradient>
                <linearGradient id="pmProg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-prog-top" />
                  <stop offset="100%" className="chart-stop-prog-bot" />
                </linearGradient>
                <linearGradient id="pmDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="chart-stop-done-top" />
                  <stop offset="100%" className="chart-stop-done-bot" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={(d) => {
                  const [, m, day] = d.split('-');
                  return `${Number(m)}/${Number(day)}`;
                }}
                stroke="var(--chart-axis)"
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                fontSize={12}
              />
              <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="hours_queued" name="Queued" fill="url(#pmQueued)" stackId="workload" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="hours_in_progress" name="In Progress" fill="url(#pmProg)" stackId="workload" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="hours_completed" name="Completed" fill="url(#pmDone)" stackId="workload" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      </div>
  );
}
