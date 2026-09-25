import { useValueToast } from '../components/Toast';
import Alert from '../components/Alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import useHistoricalReport, { METRICS } from './useHistoricalReport';

const years = () => {
  const y = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => String(y - i));
};

const isHourMetric = (m) => m === 'estimated_hours' || m === 'completed_hours';
const fmtValue = (m, v) => (isHourMetric(m) ? Number(v).toFixed(1) : Number(v).toLocaleString());

function LineTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{METRICS[metric]} · {label}</div>
      <div>{fmtValue(metric, payload[0].value)}{isHourMetric(metric) ? 'h' : ''}</div>
    </div>
  );
}

export default function HistoricalReport() {
  const { report, error, loading, quarters, kpi, selectedIndex, year, setYear, quarter, setQuarter, metric, setMetric } = useHistoricalReport();
  useValueToast(error);

  if (loading) return <div>Loading...</div>;
  if (!report) return null;

  const rows = quarters;

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>Historical Report</h3>
          {report && (
            <span className="badge badge-muted">
              Year {report.year} · {quarter ? `Q${quarter}` : 'All quarters'}
            </span>
          )}
        </div>

        <div className="flex" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="filter-input" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" style={{ width: 110 }}>
            {years().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-input" value={quarter} onChange={(e) => setQuarter(e.target.value)} aria-label="Quarter" style={{ width: 140 }}>
            <option value="">All quarters</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{`Q${q}`}</option>)}
          </select>
        </div>

        {error && <Alert variant="destructive" className="mb-16">{error}</Alert>}

        {quarters.length === 0 ? (
          <div className="text-muted">No data for this year.</div>
        ) : (
          <>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="label">Work Orders</div><div className="value">{kpi.work_orders}</div></div>
              <div className="stat"><div className="label">Custom Items</div><div className="value">{kpi.custom_items}</div></div>
              <div className="stat"><div className="label">Estimated Hours</div><div className="value">{Number(kpi.estimated_hours).toFixed(1)}h</div></div>
              <div className="stat"><div className="label">Completed Hours</div><div className="value">{Number(kpi.completed_hours).toFixed(1)}h</div></div>
              <div className="stat"><div className="label">Coder Reviews</div><div className="value">{kpi.coder_reviews}</div></div>
            </div>

            <div className="table-scroll" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th className="num">Work Orders</th>
                    <th className="num">Custom Items</th>
                    <th className="num">Estimated Hours</th>
                    <th className="num">Completed Hours</th>
                    <th className="num">Coder Reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q, i) => (
                    <tr
                      key={q.quarter}
                      style={i === selectedIndex ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', fontWeight: 600 } : undefined}
                    >
                      <td><strong>{q.quarter}</strong></td>
                      <td className="num">{q.work_orders}</td>
                      <td className="num">{q.custom_items}</td>
                      <td className="num">{Number(q.estimated_hours).toFixed(1)}</td>
                      <td className="num">{Number(q.completed_hours).toFixed(1)}</td>
                      <td className="num">{q.coder_reviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between align-center mb-16">
              <h3 style={{ margin: 0 }}>Quarter Trend</h3>
            </div>
            <div className="flex" style={{ gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {Object.entries(METRICS).map(([key, label]) => (
                <button
                  key={key}
                  className="btn btn-sm"
                  style={key === metric ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                  onClick={() => setMetric(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rows} margin={{ top: 12, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="quarter" stroke="var(--chart-axis)" tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} fontSize={12} />
                <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={isHourMetric(metric)} />
                <Tooltip content={<LineTooltip metric={metric} />} cursor={{ stroke: 'var(--chart-grid)' }} />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={({ cx, cy, index }) => (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={index === selectedIndex ? 5 : 3}
                      fill={index === selectedIndex ? 'var(--accent)' : 'var(--text-faint)'}
                      stroke={index === selectedIndex ? 'var(--surface)' : 'none'}
                      strokeWidth={2}
                    />
                  )}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}