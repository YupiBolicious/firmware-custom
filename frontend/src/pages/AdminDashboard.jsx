import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import useAdminDashboard, { RANGE_PRESETS } from './useAdminDashboard';

const HEALTH_COLORS = { online: 'var(--success)', warning: 'var(--warning)', offline: 'var(--danger)' };

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
      <div className="chart-tip-title">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color || entry.payload?.fill }}>
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
}

function ConfigCard({ configs }) {
  return (
    <div className="config-cards">
      {configs.map(({ label, count, to }) => (
        <div key={label} className="config-card">
          <div className="config-card-name">{label}</div>
          <div className="config-card-count">{count}</div>
          <Link className="btn btn-secondary btn-sm" to={to}>Manage</Link>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { data, error, loading, preset, changePreset, trendRefreshing, trendError } = useAdminDashboard();

  if (loading && !data) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { kpis, health, users, classification, config, trend } = data;
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
        <div className="stat">
          <div className="label">Classification Rules</div>
          <div className="value">{kpis.classification_rules}</div>
        </div>
      </div>

      {/* 2. System Health */}
      <div className="panel mb-16">
        <h3 className="mb-16">System Health</h3>
        <div className="flex gap-16" style={{ flexWrap: 'wrap' }}>
          {Object.entries(health).map(([key, status]) => (
            <div key={key} className="flex align-center" style={{ gap: 8, fontSize: 13 }}>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text)', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}
              </span>
              <span className="flex align-center" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: HEALTH_COLORS[status] || 'var(--text-muted)' }} />
                <span style={{ color: HEALTH_COLORS[status] || 'var(--text-muted)', textTransform: 'capitalize' }}>{status}</span>
              </span>
            </div>
          ))}
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
        <h3 className="mb-16">Classification / Knowledge Base Overview</h3>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Total KB Entries</div>
            <div className="value">{classification.total_kb_entries}</div>
          </div>
          <div className="stat">
            <div className="label">Coder-Confirmed</div>
            <div className="value" style={{ color: 'var(--success)' }}>{classification.coder_confirmed}</div>
          </div>
          <div className="stat">
            <div className="label">High-Confidence</div>
            <div className="value">{classification.high_confidence}</div>
          </div>
          <div className="stat">
            <div className="label">Low-Confidence / Review</div>
            <div className="value" style={{ color: classification.review_cases > 0 ? 'var(--warning)' : undefined }}>{classification.review_cases}</div>
          </div>
          <div className="stat">
            <div className="label">Coder Resolution Rate</div>
            <div className="value">{resolutionRate}%</div>
          </div>
        </div>
      </div>

      {/* 5. System Configuration */}
      <div className="panel mb-16">
        <h3 className="mb-16">System Configuration</h3>
        <ConfigCard configs={[
          { label: 'Complexity Levels', count: config.complexity_levels, to: '/complexity-levels' },
          { label: 'Classification Rules', count: config.classification_rules, to: '/classification-rules' },
          { label: 'Confidence Thresholds', count: config.confidence_thresholds, to: '/confidence-thresholds' },
          { label: 'FW Modules', count: config.fw_modules, to: '/fw-modules' },
          { label: 'Machine Models', count: config.machine_models, to: '/machine-models' },
          { label: 'Machine Model Versions', count: config.machine_model_versions, to: '/machine-models' },
        ]} />
      </div>

      {/* 6. System Activity Trend */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>System Activity Trend</h3>
          <div className="flex gap-8 align-center">
            {trendRefreshing && (
              <span className="text-muted" style={{ fontSize: 12 }}>Updating…</span>
            )}
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`btn btn-sm ${preset === p.key ? '' : 'btn-secondary'}`}
                onClick={() => changePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {trendError && <div className="alert alert-error mb-16">{trendError}</div>}

        {buckets.length === 0 ? (
          <div className="text-muted">No activity data for the selected period.</div>
        ) : (
          <>
          <div className="split-2">
          <div style={{ minWidth: 0 }}>
            <h4 className="mb-8" style={{ fontWeight: 600, fontSize: 14 }}>
              Work Orders Created
              <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                total {buckets.reduce((s, b) => s + Number(b.work_orders || 0), 0)}
              </span>
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="32%">
                <defs>
                  <linearGradient id="adminWo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="chart-stop-prog-top" />
                    <stop offset="100%" className="chart-stop-prog-bot" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => formatBucketLabel(d, granularity)} stroke="var(--chart-axis)" tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} fontSize={12} />
                <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip content={<TrendTooltip />} labelFormatter={(l) => formatBucketFull(l)} cursor={{ fill: 'var(--chart-cursor)' }} />
                <ReferenceLine
                  y={buckets.length ? buckets.reduce((s, b) => s + Number(b.work_orders || 0), 0) / buckets.length : 0}
                  stroke="var(--chart-axis)" strokeDasharray="4 4"
                  label={{ value: 'avg', fontSize: 10, fill: 'var(--chart-axis)' }}
                />
                <Bar dataKey="work_orders" name="Work Orders Created" fill="url(#adminWo)" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ minWidth: 0 }}>
            <h4 className="mb-8" style={{ fontWeight: 600, fontSize: 14 }}>
              KB Entries Added
              <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                total {buckets.reduce((s, b) => s + Number(b.kb_added || 0), 0)}
              </span>
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="32%">
                <defs>
                  <linearGradient id="adminKb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="chart-stop-kb-top" />
                    <stop offset="100%" className="chart-stop-kb-bot" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => formatBucketLabel(d, granularity)} stroke="var(--chart-axis)" tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} fontSize={12} />
                <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip content={<TrendTooltip />} labelFormatter={(l) => formatBucketFull(l)} cursor={{ fill: 'var(--chart-cursor)' }} />
                <ReferenceLine
                  y={buckets.length ? buckets.reduce((s, b) => s + Number(b.kb_added || 0), 0) / buckets.length : 0}
                  stroke="var(--chart-axis)" strokeDasharray="4 4"
                  label={{ value: 'avg', fontSize: 10, fill: 'var(--chart-axis)' }}
                />
                <Bar dataKey="kb_added" name="KB Entries Added" fill="url(#adminKb)" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </div>

            <h4 className="mt-16 mb-8" style={{ fontWeight: 600, fontSize: 14 }}>Classification &amp; Review Activity</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={buckets} margin={{ top: 12, right: 20, left: 0, bottom: 5 }} barCategoryGap="28%" barGap={3}>
                <defs>
                  <linearGradient id="adminClassified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="chart-stop-done-top" />
                    <stop offset="100%" className="chart-stop-done-bot" />
                  </linearGradient>
                  <linearGradient id="adminResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="chart-stop-amber-top" />
                    <stop offset="100%" className="chart-stop-amber-bot" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => formatBucketLabel(d, granularity)} stroke="var(--chart-axis)" tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} fontSize={12} />
                <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip content={<TrendTooltip />} labelFormatter={(l) => formatBucketFull(l)} cursor={{ fill: 'var(--chart-cursor)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar dataKey="items_classified" name="Items Classified" fill="url(#adminClassified)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="coder_resolved" name="Coder Resolved" fill="url(#adminResolved)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}