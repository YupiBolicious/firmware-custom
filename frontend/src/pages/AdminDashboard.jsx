import { useValueToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useAdminDashboard, { RANGE_PRESETS } from './useAdminDashboard';
import WoDashboardList from './WoDashboardList';
import useDashboardWoList from './useDashboardWoList';

const WORK_ORDER_STATUSES = ['DRAFT', 'ANALYZED', 'FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE', 'COMPLETED'];

function formatBucketLabel(date, granularity) {
  const [y, m, d] = date.split('-');
  if (granularity === 'month') return `${Number(m)}/${y}`;
  return `${Number(m)}/${Number(d)}`;
}

function formatBucketFull(date) {
  const [y, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{formatBucketFull(label)}</div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: entry.color || '#fff',
            marginTop: 4
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.color || '#fff',
              display: 'inline-block'
            }}
          />
          <span>{entry.name}</span>
          <strong style={{ marginLeft: 'auto' }}>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}


export default function AdminDashboard() {
  const { data, error, loading, preset, changePreset, trendRefreshing, trendError, workload } =   useAdminDashboard();
  const workOrders = useDashboardWoList();
  useValueToast(error);
  useValueToast(trendError);
  useValueToast(workOrders.error);
    
  const woColumns = [
    {
      key: 'work-order',
      label: 'Work Order',
      render: (w) => (
        <Link to={`/work-orders/${w.id}`}>
          <strong>{w.wo_number}</strong>
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer', className: 'text-muted',
      render: (w) => w.customer || '-' },
    { key: 'model', label: 'Model', render: (w) => w.group_summary || '-' },
    { key: 'status', label: 'Status', render: (w) => w.status },
    { key: 'items', label: 'Items', render: (w) => w.item_count ?? 0 },
    {
      key: 'hours',
      label: 'Est. Hours',
      render: (w) => `${Number(w.total_estimated_hours || 0).toFixed(1)}h`,
    },
    { key: 'created-by', label: 'Created By', render: (w) => w.created_by_name || '-' },
  ];

  if (loading && !data) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Dashboard unavailable.</div>;
  if (!data) return null;

  const { kpis, users, classification, trend } = data;
  const buckets = trend?.buckets || [];
  const granularity = trend?.granularity || 'week';

  const resolutionRate = (classification.coder_confirmed + classification.review_cases) > 0
    ? Math.round((classification.coder_confirmed / (classification.coder_confirmed + classification.review_cases)) * 100)
    : 0;

  return (
    <div>
      <h1>Admin Dashboard</h1>

      {/* 1. System KPIs */}
      <div className="stats-grid mb-16">
        <div className="stat">
          <div className="label">Total Users</div>
          <div className="value">{kpis.total_users}</div>
        </div>
        <div className="stat">
          <div className="label">Active Users</div>
          <div className="value" style={{ color: 'var(--success)' }}>{kpis.active_users}</div>
        </div>
        <div className="stat">
          <div className="label">Total Work Orders</div>
          <div className="value">{kpis.total_work_orders}</div>
        </div>
        <div className="stat">
          <div className="label">Total Custom Items</div>
          <div className="value">{kpis.total_custom_items}</div>
        </div>
        <div className="stat">
          <div className="label">FW Related Items</div>
          <div className="value">{kpis.fw_related_items}</div>
        </div>
        <div className="stat">
          <div className="label">Pending Coder Reviews</div>
          <div className="value" style={{ color: kpis.pending_coder_reviews > 0 ? 'var(--warning)' : undefined }}>
            {kpis.pending_coder_reviews}
          </div>
        </div>
        <div className="stat">
          <div className="label">KB Entries</div>
          <div className="value">{kpis.kb_entries}</div>
        </div>
      </div>

      {/* 3. User & Role Overview */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>User & Role Overview</h3>
          <Link className="btn btn-secondary btn-sm" to="/users">User Management</Link>
        </div>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Project Managers</div>
            <div className="value">{users.pm}</div>
          </div>
          <div className="stat">
            <div className="label">Coders</div>
            <div className="value">{users.coder}</div>
          </div>
          <div className="stat">
            <div className="label">Admins</div>
            <div className="value">{users.admin}</div>
          </div>
          <div className="stat">
            <div className="label">Inactive</div>
            <div className="value" style={{ color: users.inactive > 0 ? 'var(--warning)' : undefined }}>{users.inactive}</div>
          </div>
        </div>
      </div>

      {/* 4. Classification / KB Overview */}
      <div className="panel mb-16">
        <h3 className="mb-16">Classification Overview</h3>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Knowledge Base Entries</div>
            <div className="value">{classification.total_kb_entries}</div>
          </div>
          <div className="stat">
            <div className="label">Items Reviewed</div>
            <div className="value" style={{ color: 'var(--success)' }}>{classification.coder_confirmed}</div>
          </div>
          <div className="stat">
            <div className="label">High-Confidence</div>
            <div className="value">{classification.high_confidence}</div>
          </div>
          <div className="stat">
            <div className="label">Waiting for Review</div>
            <div className="value" style={{ color: classification.review_cases > 0 ? 'var(--warning)' : undefined }}>{classification.review_cases}</div>
          </div>
          <div className="stat">
            <div className="label">Review Rate</div>
            <div className="value">{resolutionRate}%</div>
          </div>
        </div>
      </div>

      <WoDashboardList
        title="Work Orders"
        rows={workOrders.rows}
        total={workOrders.total}
        page={workOrders.page}
        totalPages={workOrders.totalPages}
        onPageChange={workOrders.setPage}
        columns={woColumns}
        hasActiveFilters={workOrders.hasActiveFilters}
        filterControls={
          <div className="toolbar mb-8">
            <input
              className="filter-input"
              type="search"
              placeholder="Search work orders..."
              value={workOrders.searchInput}
              onChange={(event) => workOrders.setSearchInput(event.target.value)}
            />
            <select className="filter-input" value={workOrders.status} onChange={(event) => workOrders.setStatus(event.target.value)}>
              <option value="ALL">All Statuses</option>
              {['DRAFT', 'ANALYZED', 'FINALIZED', 'PRODUCTION', 'COMPLETED'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        }
        emptyMessage={workOrders.loading ? 'Loading work orders...' : 'No work orders yet.'}
      />
      {/* Workload overview */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload Overview</h3>
        {(() => {
          const queued = workload.queued;
          const inProgress = workload.in_progress;
          const completed = workload.completed;
          const total = workload.total;
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

      {/* 6. System Activity Trend */}
      <section className="panel admin-trend-panel mb-16">
        <div className="admin-trend-header">
          <div>
            <div className="admin-trend-title-row">
              <h3>System Activity</h3>
              {trendRefreshing && <span className="admin-trend-updating">Updating…</span>}
            </div>
            <p className="admin-trend-subtitle">
              {trend?.from && trend?.to
                ? `${formatBucketFull(trend.from)} – ${formatBucketFull(trend.to)} · grouped by ${granularity}`
                : 'Work orders, knowledge-base growth, and classification activity'}
            </p>
          </div>
          <div className="admin-trend-range" aria-label="Activity date range">
            {RANGE_PRESETS.map((range) => (
              <button
                key={range.key}
                type="button"
                className={`admin-trend-range-button${preset === range.key ? ' is-active' : ''}`}
                onClick={() => changePreset(range.key)}
                aria-pressed={preset === range.key}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {buckets.length === 0 ? (
          <div className="admin-trend-empty">No activity data for the selected period.</div>
        ) : (
          <>
            <div className="admin-trend-summary">
              {[
                { label: 'Work orders', key: 'work_orders', color: 'var(--info)' },
                { label: 'KB entries', key: 'kb_added', color: 'var(--accent)' },
                { label: 'Items classified', key: 'items_classified', color: 'var(--success)' },
                { label: 'Coder resolved', key: 'coder_resolved', color: 'var(--warning)' },
              ].map((metric) => (
                <div className="admin-trend-summary-card" key={metric.key}>
                  <span className="admin-trend-summary-dot" style={{ background: metric.color }} />
                  <span className="admin-trend-summary-label">{metric.label}</span>
                  <strong>{buckets.reduce((sum, bucket) => sum + Number(bucket[metric.key] || 0), 0).toLocaleString()}</strong>
                </div>
              ))}
            </div>

            <div className="admin-trend-grid">
              <TrendPanel
                title="Work Orders Created"
                total={buckets.reduce((sum, bucket) => sum + Number(bucket.work_orders || 0), 0)}
                buckets={buckets}
                granularity={granularity}
                series={[{ key: 'work_orders', name: 'Work orders', color: 'var(--info)' }]}
              />
              <TrendPanel
                title="Knowledge Base Growth"
                total={buckets.reduce((sum, bucket) => sum + Number(bucket.kb_added || 0), 0)}
                buckets={buckets}
                granularity={granularity}
                series={[{ key: 'kb_added', name: 'KB entries', color: 'var(--accent)' }]}
              />
              <TrendPanel
                title="Classification & Review"
                total={buckets.reduce((sum, bucket) => sum + Number(bucket.items_classified || 0) + Number(bucket.coder_resolved || 0), 0)}
                buckets={buckets}
                granularity={granularity}
                wide
                series={[
                  { key: 'items_classified', name: 'Items classified', color: 'var(--success)' },
                  { key: 'coder_resolved', name: 'Coder resolved', color: 'var(--warning)' },
                ]}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TrendPanel({ title, total, buckets, granularity, series, wide = false }) {
  return (
    <section className={`admin-trend-card${wide ? ' admin-trend-card-wide' : ''}`}>
      <div className="admin-trend-card-heading">
        <div>
          <h4>{title}</h4>
          <span className="admin-trend-card-caption">Activity by {granularity}</span>
        </div>
        <strong className="admin-trend-card-total">{total.toLocaleString()}</strong>
      </div>
      <ResponsiveContainer width="100%" height={wide ? 250 : 220}>
        <AreaChart data={buckets} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => formatBucketLabel(date, granularity)}
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            minTickGap={24}
            fontSize={11}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={34}
            fontSize={11}
          />
          <Tooltip content={<TrendTooltip />} labelFormatter={formatBucketFull} cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />}
          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.name}
              stroke={item.color}
              fill={item.color}
              fillOpacity={0.12}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}