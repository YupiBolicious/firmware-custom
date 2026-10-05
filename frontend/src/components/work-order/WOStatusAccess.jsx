import { Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '../StatusBadge';

export default function WOStatusAccess({ 
  wo, 
  canEdit, 
  canManageAccess, 
  isCoder, 
  finalizing, 
  startingProduction, 
  completing, 
  handleFinalize, 
  handleStartProduction, 
  handleCompleteProduction, 
  reviewedItems, 
  completeAllLabel, 
  countOpenItem, 
  openTaskCount,
  staleVerdicts,
  handleAnalyze,
  analyzing,
  users,
  access,
  accessBusy,
  handleGrantAccess,
  handleRevokeAccess
}) {
  return (
    <>
      <div className="flex justify-between align-center mb-16">
        <h1>{wo.wo_number}</h1>
        <div className="flex gap-8">
          {canEdit && wo.status !== 'FINALIZED' && wo.status !== 'PRODUCTION' && wo.status !== 'COMPLETED' && (
            <Link className="icon-btn" to={`/work-orders/${wo.id}/edit`} title="Edit Work Order" aria-label="Edit Work Order"><Pencil size={16} strokeWidth={1.5} /></Link>
          )}
          {canEdit && wo.status === 'ANALYZED' && (
            <button className="btn" onClick={handleFinalize} disabled={finalizing || countOpenItem > 0} title={countOpenItem > 0 ? `${countOpenItem} item(s) awaiting coder review` : undefined}>
              {finalizing ? 'Finalizing...' : reviewedItems}
            </button>
          )}
          {isCoder && wo.status === 'FINALIZED' && (
            <button className="btn" onClick={handleStartProduction} disabled={startingProduction}>
              {startingProduction ? 'Starting...' : 'Start Production'}
            </button>
          )}
          {isCoder && wo.status === 'PRODUCTION' && (
            <button className="btn" onClick={handleCompleteProduction} disabled={completing || openTaskCount > 0}>
              {completing ? 'Completing...' : completeAllLabel}
            </button>
          )}
        </div>
      </div>

      <div className="panel mb-16">
        <h3>Work Order Details</h3>
        <div className="form-grid">
          <div><span className="text-muted">Status:</span> <StatusBadge status={wo.status} />
            {staleVerdicts && canEdit && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 8 }}
                onClick={handleAnalyze}
                disabled={analyzing}
                title="Item text changed after the last analysis"
              >
                {analyzing ? 'Analyzing...' : 'Re-analyze'}
              </button>
            )}
          </div>
          <div><span className="text-muted">Customer:</span> {wo.customer || '-'}</div>
          <div><span className="text-muted">Created By:</span> {wo.created_by_name || '-'}</div>
          <div><span className="text-muted">Created At:</span> {new Date(wo.created_at).toLocaleString()}</div>
          {['ANALYZED', 'FINALIZED'].includes(wo.status) && (
            <div><span className="text-muted">Total Estimated Hours:</span> {wo.total_estimated_hours}h</div>
          )}
        </div>
        {wo.description && <div className="mt-8 text-muted">{wo.description}</div>}
      </div>

      {canManageAccess && (
        <div className="panel table-scroll mb-16">
          <div className="flex justify-between align-center">
            <h3 style={{ margin: 0 }}>Shared Access</h3>
          </div>
          <div className="flex gap-8 mb-16">
            <select className="wo-input-text" defaultValue="" id="access-grant-select">
              <option value="" disabled>Select user to grant access...</option>
              {users
                .filter((u) => Number(u.id) !== Number(wo.created_by) && !access.some((a) => Number(a.user_id) === Number(u.id)))
                .map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.username})</option>
                ))}
            </select>
            <button
              className="btn btn-sm"
              disabled={accessBusy === 'grant'}
              onClick={() => {
                const el = document.getElementById('access-grant-select');
                const val = el && el.value;
                if (val) {
                  handleGrantAccess(val);
                  el.value = '';
                }
              }}
            >
              {accessBusy === 'grant' ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
          {access.length === 0 ? (
            <div className="text-muted">No shared access. Only the owner (and admins) can edit this work order.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {access.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.full_name || a.username} ({a.username})</td>
                    <td>
                      <button className="btn btn-danger btn-sm" disabled={accessBusy === a.user_id} onClick={() => handleRevokeAccess(a.user_id)}>
                        {accessBusy === a.user_id ? 'Removing...' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
