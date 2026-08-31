import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RelativeTime from '../components/RelativeTime';
import usePmDashboard from './usePmDashboard';

const STATUS_BADGE = {
  DRAFT: 'badge-muted',
  ANALYZED: 'badge-info',
  FINALIZED: 'badge-warning',
  PRODUCTION: 'badge-success',
  COMPLETED: 'badge-success',
};

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 4, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value}h
        </div>
      ))}
    </div>
  );
}

export default function PMDashboard() {
  const {
    data, error, loading, formatStatus,
    filters, showAdvanced, setShowAdvanced, setFilter, clearFilters,
    filteredQueue, matchingCount, hasActiveFilters,
    uniqueModels, uniqueVersions, uniqueComplexities,
    filteredKpis, filteredStatusDistribution, filteredWorkload, filteredTrend, filteredAttention,
  } = usePmDashboard();

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <h1>PM Dashboard</h1>

      {/* 1. KPI Summary */}
      <div className="stats-grid mb-16">
        <div className="stat">
          <div className="label">Active WOs</div>
          <div className="value">{filteredKpis.active_wos}</div>
        </div>
        <div className="stat">
          <div className="label">Pending Coder Review</div>
          <div className="value" style={{ color: filteredKpis.pending_review > 0 ? 'var(--warning)' : undefined }}>
            {filteredKpis.pending_review}
          </div>
        </div>
        <div className="stat">
          <div className="label">In Progress</div>
          <div className="value">{filteredKpis.in_progress}</div>
        </div>
        <div className="stat">
          <div className="label">Completed</div>
          <div className="value" style={{ color: 'var(--success)' }}>{filteredKpis.completed}</div>
        </div>
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

      {/* 2. Work Queue + Filters */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-8">
          <h3>
            Work Queue
            {hasActiveFilters && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                {matchingCount} of {data.work_queue.length} shown
              </span>
            )}
          </h3>
          <div className="flex gap-8">
            {hasActiveFilters && (
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear Filters</button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-8 mb-8">
          <input
            style={{ flex: 1, padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#e0e0e0', fontSize: 13 }}
            placeholder="Search WO number, title, customer, or item..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
          <button
            className={`btn btn-sm ${showAdvanced ? '' : 'btn-secondary'}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Filters {showAdvanced ? '▲' : '▼'}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvanced && (
          <div style={{ padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333', marginBottom: 12 }}>
            <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Status</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.statusFilter}
                  onChange={(e) => setFilter('statusFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {Object.keys(STATUS_BADGE).map((s) => (
                    <option key={s} value={s}>{formatStatus(s)}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Machine Model</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.modelFilter}
                  onChange={(e) => setFilter('modelFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {uniqueModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Version</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.versionFilter}
                  onChange={(e) => setFilter('versionFilter', e.target.value)}
                  disabled={filters.modelFilter === 'ALL'}
                >
                  <option value="ALL">All</option>
                  {uniqueVersions.map((v) => (
                    <option key={v.id} value={v.id}>{v.code}</option>
                  ))}
                </select>
              </div>
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
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>FW Related</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.fwRelatedFilter}
                  onChange={(e) => setFilter('fwRelatedFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="FW">Firmware</option>
                  <option value="NON_FW">Non-Firmware</option>
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

        {filteredQueue.length === 0 ? (
          <div className="text-muted">No work orders match the current filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>WO Number</th>
                <th>Model</th>
                <th>Title</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Status</th>
                <th>Hours</th>
                <th>Progress</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.map((w) => (
                <tr key={w.id}>
                  <td><Link to={`/work-orders/${w.id}`}><strong>{w.wo_number}</strong></Link></td>
                  <td className="text-muted">{w.group_summary || '-'}</td>
                  <td>{w.title || '-'}</td>
                  <td className="text-muted">{w.customer || '-'}</td>
                  <td>{w.item_count}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[w.status] || 'badge-muted'}`}>
                      {formatStatus(w.status)}
                    </span>
                  </td>
                  <td>{w.total_estimated_hours > 0 ? `${w.total_estimated_hours}h` : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#333', borderRadius: 3 }}>
                        <div style={{ width: `${w.progress}%`, height: '100%', background: w.progress === 100 ? 'var(--success)' : 'var(--info)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#aaa', minWidth: 32 }}>{w.progress}%</span>
                    </div>
                  </td>
                  <td className="text-muted">
                    <RelativeTime date={w.last_activity || w.updated_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Progress Overview */}
      <div className="panel mb-16">
        <h3 className="mb-16">Progress Overview</h3>
        {filteredStatusDistribution.length === 0 ? (
          <div className="text-muted">No status data available.</div>
        ) : (
          <div>
            <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              {filteredStatusDistribution.map((s) => {
                const total = filteredStatusDistribution.reduce((sum, x) => sum + x.count, 0);
                const pct = total > 0 ? (s.count / total) * 100 : 0;
                const colors = { DRAFT: '#666', ANALYZED: '#2196f3', FINALIZED: '#ff9800', PRODUCTION: '#4caf50', COMPLETED: '#166534' };
                return pct > 0 ? (
                  <div
                    key={s.status}
                    title={`${formatStatus(s.status)}: ${s.count}`}
                    style={{ width: `${pct}%`, background: colors[s.status] || '#555' }}
                  />
                ) : null;
              })}
            </div>
            <div className="flex gap-16" style={{ flexWrap: 'wrap' }}>
              {filteredStatusDistribution.map((s) => (
                <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: { DRAFT: '#666', ANALYZED: '#2196f3', FINALIZED: '#ff9800', PRODUCTION: '#4caf50', COMPLETED: '#166534' }[s.status] || '#555' }} />
                  <span className="text-muted">{formatStatus(s.status)}:</span> <strong>{s.count}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Workload / Estimation Overview */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload Overview</h3>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Queued Hours</div>
            <div className="value">{filteredWorkload.queued.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">In Progress Hours</div>
            <div className="value">{filteredWorkload.in_progress.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Completed Hours</div>
            <div className="value" style={{ color: 'var(--success)' }}>{filteredWorkload.completed.toFixed(1)}h</div>
          </div>
          <div className="stat">
            <div className="label">Total Hours</div>
            <div className="value">{(filteredWorkload.queued + filteredWorkload.in_progress + filteredWorkload.completed).toFixed(1)}h</div>
          </div>
        </div>
      </div>

      {/* 5. Workload & Status Trend */}
      <div className="panel mb-16">
        <h3 className="mb-16">Workload & Status Chart</h3>
        {filteredTrend.length === 0 ? (
          <div className="text-muted">No trend data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
              <XAxis
                dataKey="week"
                tickFormatter={(d) => {
                  const [, m, day] = d.split('-');
                  return `${Number(m)}/${Number(day)}`;
                }}
                stroke="#9a9a9a"
                fontSize={12}
              />
              <YAxis stroke="#9a9a9a" fontSize={12} allowDecimals={false} />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="hours_queued" name="Queued" fill="#666" stackId="workload" />
              <Bar dataKey="hours_in_progress" name="In Progress" fill="#2196f3" stackId="workload" />
              <Bar dataKey="hours_completed" name="Completed" fill="#4caf50" stackId="workload" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 6. Attention Required */}
      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>
            Attention Required
            {filteredAttention.length > 0 && (
              <span
                className="badge"
                style={{
                  marginLeft: 8,
                  background: filteredAttention.some((a) => a.priority === 'danger') ? 'rgba(244,67,54,0.2)' : 'rgba(255,152,0,0.2)',
                  color: filteredAttention.some((a) => a.priority === 'danger') ? 'var(--danger)' : 'var(--warning)',
                }}
              >
                {filteredAttention.length}
              </span>
            )}
          </h3>
        </div>

        {filteredAttention.length === 0 ? (
          <div className="text-muted">No attention required.</div>
        ) : (
          <div className="attention-list">
            {filteredAttention.map((a, i) => (
              <div key={i} className={`attention-item attention-${a.priority}`}>
                <div className="attention-body">
                  <span className="attention-title"><strong>{a.wo_number}</strong></span>
                  <span className="attention-message">{a.message}</span>
                  {a.age_hours != null && (
                    <span className="attention-age text-muted">{Math.floor(a.age_hours)}h</span>
                  )}
                </div>
                <Link to={`/work-orders/${a.work_order_id}`} className="btn btn-sm">View WO</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
