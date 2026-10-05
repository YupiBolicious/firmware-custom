import StatusBadge from '../StatusBadge';
import { reviewReasonLabel, blockReasonLabel } from '../../lib/reviewLabels';

export default function WOEstimationPreview({ analysis }) {
  if (!analysis) return null;
  const { summary } = analysis;

  return (
    <div className="panel table-scroll">
      <h3>Estimation Preview</h3>
      <div className="stats-grid compact">
        <div className="stat">
          <div className="label">Total Items</div>
          <div className="value">{summary.total_items} items</div>
        </div>
        <div className="stat">
          <div className="label">Firmware Items</div>
          <div className="value">{summary.firmware_items} items</div>
        </div>
        <div className="stat">
          <div className="label">Non-Firmware Items</div>
          <div className="value">{summary.non_firmware_items} items</div>
        </div>
        <div className="stat">
          <div className="label">Waiting for Review</div>
          <div className="value">{summary.waiting_review} items</div>
        </div>
        <div className="stat">
          <div className="label">Total Estimated Hours</div>
          <div className="value">{summary.total_estimated_hours} hours</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Model / Unit</th>
            <th>Title</th>
            <th>Firmware</th>
            <th>Complexity</th>
            <th>Hours</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Review</th>
            <th>Assistance</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          {analysis.results.map((r) => {
            const inReview = r.status === 'CODER_REVIEW';
            const marginPct = r.assist_semantic_margin != null ? `${(Number(r.assist_semantic_margin) * 100).toFixed(1)}` : null;
            return (
            <tr key={r.item_id}>
              <td>{r.item_number}</td>
              <td>
                {[r.machine_model_code, r.serial_number ? `SN: ${r.serial_number}` : null].filter(Boolean).join(' / ') || '-'}
              </td>
              <td>{r.title}</td>
              <td>{r.fw_related === true ? 'YES' : r.fw_related === false ? 'NO' : 'Pending'}</td>
              <td>
                {inReview && r.assist_complexity_code
                  ? `${r.assist_complexity_code} (Prov.)`
                  : r.complexity_code || '-'}
              </td>
              <td>
                {r.estimated_hours != null
                  ? `${r.estimated_hours}h`
                  : inReview
                    ? (r.provisional_hours != null ? `${r.provisional_hours}h (Prov.)` : 'Awaiting Coder Review')
                    : 'N/A'}
              </td>
              <td>{r.quantity || '-'}</td>
              <td><StatusBadge status={r.status} /></td>
              <td>
                {inReview
                  ? (reviewReasonLabel(r.review_reason) || r.classification_reason || '-')
                  : '-'}
              </td>
              <td>
                {inReview && r.assist_kb_code
                  ? <div style={{ fontSize: 12 }}>
                      <span className="badge badge-info">{r.assist_kb_code}</span>
                      {r.assist_kb_title ? <div className="text-muted">{r.assist_kb_title}</div> : null}
                    </div>
                  : inReview && r.assist_blocked_reason
                    ? <span className="text-muted">{blockReasonLabel(r.assist_blocked_reason) || '-'}</span>
                    : '-'}
              </td>
              <td>
                {inReview && r.assist_match_score != null
                  ? `${r.assist_match_score}% sim${marginPct != null ? ` · margin ${marginPct}` : ''}`
                  : '-'}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
