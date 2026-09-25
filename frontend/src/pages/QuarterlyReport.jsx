import { useValueToast } from '../components/Toast';
import Alert from '../components/Alert';
import useQuarterlyReport from './useQuarterlyReport';

export default function QuarterlyReport() {
  const {
    report, error, loading, quarters, totals,
    draftFrom, draftTo, setDraftFrom, setDraftTo, apply,
  } = useQuarterlyReport();
  useValueToast(error);

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="flex justify-between align-center mb-16">
          <h3 style={{ margin: 0 }}>Quarterly Report</h3>
          {report?.range?.from && (
            <span className="badge badge-muted">
              Range {report.range.from} → {report.range.to} · quarterly
            </span>
          )}
        </div>

        <div className="flex" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input type="date" className="filter-input" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="filter-input" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} aria-label="To date" />
          <button className="btn btn-sm" onClick={apply}>Apply</button>
        </div>

        {error && <Alert variant="destructive" className="mb-16">{error}</Alert>}

        {loading ? (
          <div>Loading...</div>
        ) : report ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="label">Work Orders</div><div className="value">{totals.work_orders}</div></div>
              <div className="stat"><div className="label">Custom Items</div><div className="value">{totals.custom_items}</div></div>
              <div className="stat"><div className="label">Queued (h)</div><div className="value">{totals.hours.queued}</div></div>
              <div className="stat"><div className="label">In Progress (h)</div><div className="value">{totals.hours.in_progress}</div></div>
              <div className="stat"><div className="label">Completed (h)</div><div className="value">{totals.hours.completed}</div></div>
              <div className="stat"><div className="label">Total (h)</div><div className="value">{totals.hours.total}</div></div>
            </div>

            {quarters.length === 0 ? (
              <div className="text-muted">No data for this range.</div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Work Orders</th>
                      <th>Custom Items</th>
                      <th className="num">Queued (h)</th>
                      <th className="num">In Progress (h)</th>
                      <th className="num">Completed (h)</th>
                      <th className="num">Total (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarters.map((q) => (
                      <tr key={q.quarter}>
                        <td><strong>{q.quarter}</strong></td>
                        <td className="meta text-muted">{q.from}</td>
                        <td className="meta text-muted">{q.to}</td>
                        <td className="num">{q.work_orders}</td>
                        <td className="num">{q.custom_items}</td>
                        <td className="num">{q.hours.queued.toFixed(1)}</td>
                        <td className="num">{q.hours.in_progress.toFixed(1)}</td>
                        <td className="num">{q.hours.completed.toFixed(1)}</td>
                        <td className="num">{q.hours.total.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}