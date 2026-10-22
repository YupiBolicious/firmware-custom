import { useValueToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import usePendingReview from './usePendingReview';
import RelativeTime from '../components/RelativeTime';
import StatusBadge from '../components/StatusBadge';

// The PM may act on an item only while it is still waiting for review or once
// it has been reviewed; anything else has no action to offer.
const ACTIONABLE = ['CODER_REVIEW', 'CLASSIFIED', 'NON_FIRMWARE'];

export default function PendingReview() {
  const { items, error, loading, page, setPage, totalPages } = usePendingReview();
  useValueToast(error);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Pending review unavailable.</div>;

  return (
    <div>
      <h1>Review Status</h1>
      {items.length === 0 ? (
        <div className="panel text-muted">No items in the review pipeline.</div>
      ) : (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Model</th>
              <th>Title</th>
              <th>Suggestion</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.item_id}>
                <td><Link to={`/work-orders/${item.work_order_id}`}>{item.wo_number}</Link></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {[item.machine_model_code].filter(Boolean).join(' / ') || '-'}
                </td>
                <td>{item.title}</td>
                
                <td>
                  {item.assist_kb_code ? (
                    <div style={{ fontSize: 12, minWidth: 200 }}>
                      <div style={{ fontWeight: 600 }}>
                        <span className="badge-info">Suggestion</span>
                      </div>
                      <div className="text-muted">
                        {item.assist_fw_related != null && (item.assist_fw_related ? 'FW' : 'Non-FW')}
                        {' · '}
                        {Math.round((Number(item.assist_match_score) || 0) * 100)}% match
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted">No assistance</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={item.status} />
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {item.status === 'CODER_REVIEW' ? (
                      <>
                        {item.assigned_coder_name
                          ? `Assigned to ${item.assigned_coder_name}`
                          : 'Unassigned'}
                        {' · waiting since '}
                        <RelativeTime date={item.created_at} />
                      </>
                    ) : (
                      <>
                        {item.reviewed_by_name ? `Reviewed by ${item.reviewed_by_name}` : 'Reviewed'}
                        {item.reviewed_at ? (
                          <>
                            {' · '}
                            <RelativeTime date={item.reviewed_at} />
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex justify-between align-center" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>Prev</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
