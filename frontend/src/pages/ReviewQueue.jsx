import { useValueToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import useReviewQueue from './useReviewQueue';
import { reviewReasonLabel } from '../lib/reviewLabels';
import { useAuth } from '../context/AuthContext';

export default function ReviewQueue() {
  const { user, hasRole } = useAuth();
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
      <h1>Custom Items Waiting For Review</h1>
      {items.length === 0 ? (
        <div className="panel text-muted">No items waiting for coder review.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Model</th>
              <th>Title</th>
              <th>Reason</th>
              <th>Suggestion</th>
              <th>Complexity</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isAdmin = hasRole('ADMIN');
              const isCoder = hasRole('CODER');
              const assigned = item.assigned_coder_id != null;
              const isAssignedToMe = assigned && user && Number(item.assigned_coder_id) === Number(user.id);
              const blockedByAssignment = isCoder && !isAdmin && assigned && !isAssignedToMe;
              return (
              <tr key={item.item_id}>
                <td><Link to={`/work-orders/${item.work_order_id}`}>{item.wo_number}</Link></td>
                <td>
                  {[item.machine_model_code].filter(Boolean).join(' / ') || '-'}
                </td>
                <td>{item.title}</td>
                <td>
                  {item.classification_reason ? (
                    <div className="text-muted" style={{ fontSize: 12 }}>{item.classification_reason}</div>
                  ) : null}
                </td>
                <td>
                  {item.assist_kb_code && !blockedByAssignment ? (() => {
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
                        {item.assist_fw_related != null && (
                            <span className="badge badge-muted">
                              {item.assist_fw_related ? 'FW' : 'Non-FW'}
                            </span>
                          )}
                        </div>

                        <div
                          className="text-muted"
                          style={{ fontSize: 12, lineHeight: 1.4 }}
                          title={item.assist_kb_title || ''}
                        >
                          {item.assist_kb_title || 'Unknown KB item'}
                        </div>

                        {/* Suggested classification */}
                        <div className="flex gap-8 align-center" style={{ fontSize: 10 }}>
                          {level && (
                            <span className="badge badge-muted">
                              Suggested {level.code}
                            </span>
                          )}
                          <span className='badge badge-info'>{score}% match</span>
                        </div>

                        {/* Decision */}
                        <div style={{display:'flex', justifyContent: 'flex-end'}} className='gap-8'>
                          <button
                            className={`btn btn-secondary badge-info ${
                              decided === 'ACCEPTED' ? 'btn-secondary' : ''
                            }`}
                            onClick={() => acceptAssist(item)}
                            disabled={reviewing === item.item_id}
                          >
                            Accept
                          </button>

                          <button
                            className={`btn btn-secondary ${
                              decided === 'IGNORED' ? 'btn-secondary' : ''
                            }`}
                            onClick={() => ignoreAssist(item)}
                            disabled={reviewing === item.item_id}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })() : (
                    <span className="text-muted">No assistance</span>
                  )}
                </td>
                <td>
                  {blockedByAssignment ? (
                    <span className="text-muted" style={{ fontSize: 12 }}>Assigned to {item.assigned_coder_name || 'another coder'}</span>
                  ) : (
                    <select
                      value={selections[item.item_id] || ''}
                      onChange={(event) => setSelections({ ...selections, [item.item_id]: event.target.value })}
                    >
                      <option value="">Select L0-L5</option>
                      {levels.map((level) => <option key={level.id} value={level.id}>{level.code} - {level.name}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {blockedByAssignment ? (
                    <span className="text-muted" style={{ fontSize: 12 }}>-</span>
                  ) : (
                    <button className="btn btn-sm" onClick={() => review(item)} disabled={!canConfirm(item) || reviewing === item.item_id}>
                      {reviewing === item.item_id ? 'Saving...' : '✔'}
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
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
