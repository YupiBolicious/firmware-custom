import { useValueToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import useReviewQueue from './useReviewQueue';
import { reviewReasonLabel } from '../lib/reviewLabels';

export default function ReviewQueue() {
  const {
    items, error, loading, levels,
    selections, setSelections,
    assistResponses, acceptAssist, ignoreAssist, assistPending, canConfirm,
    keywordInputs, setKeywordInputs,
    reviewing, review,
    page, setPage, totalPages,
  } = useReviewQueue();
  useValueToast(error);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Review queue unavailable.</div>;

  return (
    <div>
      <h1>Coder Review Queue</h1>
      {items.length === 0 ? (
        <div className="panel text-muted">No items waiting for coder review.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Model / Unit</th>
              <th>Item</th>
              <th>Title</th>
              <th>Reason</th>
              <th>Suggestion</th>
              <th>Complexity</th>
              <th>Keywords</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.item_id}>
                <td><Link to={`/work-orders/${item.work_order_id}`}>{item.wo_number}</Link></td>
                <td>
                  {[item.machine_model_code, item.serial_number ? `SN: ${item.serial_number}` : null].filter(Boolean).join(' / ') || '-'}
                </td>
                <td>{item.item_number}</td>
                <td>{item.title}</td>
                <td>
                  {item.classification_reason ? (
                    <div className="text-muted" style={{ fontSize: 12 }}>{item.classification_reason}</div>
                  ) : null}
                </td>
                <td>
                  {item.assist_kb_code ? (() => {
                    const decided = assistResponses[item.item_id] || item.assist_response;
                    const level = levels.find(
                      (l) => String(l.id) === String(item.assist_complexity_level_id)
                    );

                    const score = Math.round((Number(item.assist_match_score) || 0) * 100);
                    const margin = (Number(item.assist_semantic_margin) || 0) * 100;

                    return (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          minWidth: 220,
                          maxWidth: 300
                        }}
                      >
                        {/* Suggested KB */}
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          <span className="badge badge-info">Suggestion</span>
                          <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                            {item.assist_kb_code}
                          </span>
                        </div>

                        <div
                          className="text-muted"
                          style={{ fontSize: 12, lineHeight: 1.4 }}
                          title={item.assist_kb_title || ''}
                        >
                          {item.assist_kb_title || 'Unknown KB item'}
                        </div>

                        {/* Suggested classification */}
                        <div className="flex gap-8 align-center" style={{ fontSize: 12 }}>
                          {item.assist_fw_related != null && (
                            <span className="badge badge-muted">
                              {item.assist_fw_related ? 'FW' : 'Non-FW'}
                            </span>
                          )}

                          {level && (
                            <span className="badge badge-muted">
                              Suggested {level.code}
                            </span>
                          )}
                        </div>

                        {/* Quality */}
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {score}% match
                          {/* {score}% match · margin {margin.toFixed(1)}% */}
                        </div>

                        {/* Decision */}
                        <div className="flex gap-8 align-center">
                          <button
                            className={`btn btn-sm ${
                              decided === 'ACCEPTED' ? 'btn-secondary' : ''
                            }`}
                            onClick={() => acceptAssist(item)}
                            disabled={reviewing === item.item_id}
                          >
                            Accept
                          </button>

                          <button
                            className={`btn btn-sm ${
                              decided === 'IGNORED' ? 'btn-secondary' : ''
                            }`}
                            onClick={() => ignoreAssist(item)}
                            disabled={reviewing === item.item_id}
                          >
                            Ignore
                          </button>

                          {assistPending(item) && (
                            <span className="text-muted" style={{ fontSize: 11 }}>
                              Response required
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })() : (
                    <span className="text-muted">No assistance</span>
                  )}
                </td>
                <td>
                  <select
                    value={selections[item.item_id] || ''}
                    onChange={(event) => setSelections({ ...selections, [item.item_id]: event.target.value })}
                  >
                    <option value="">Select L0-L5</option>
                    {levels.map((level) => <option key={level.id} value={level.id}>{level.code} - {level.name}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    placeholder="optional keywords"
                    value={keywordInputs[item.item_id] || ''}
                    onChange={(event) => setKeywordInputs({ ...keywordInputs, [item.item_id]: event.target.value })}
                  />
                </td>
                <td>
                  <Link className="btn btn-secondary btn-sm" to={`/work-orders/${item.work_order_id}`}>Open</Link>{' '}
                  <button className="btn btn-sm" onClick={() => review(item)} disabled={!canConfirm(item) || reviewing === item.item_id}>
                    {reviewing === item.item_id ? 'Saving...' : 'Confirm'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
