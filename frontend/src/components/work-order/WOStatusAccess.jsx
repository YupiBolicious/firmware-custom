import { Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge, { statusBadgeMeta } from '../StatusBadge';

export default function WOStatusAccess({ 
  wo, 
  canEdit, 
  canManageAccess, 
  isCoder, 
  finalizing, 
  startingProduction, 
  completing,
  changingStatus,
  openFinalizeConfirm, 
  openStartConfirm, 
  openCompleteConfirm, 
  reviewedItems, 
  allNonFirmware,
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
  handleRevokeAccess,
  onRequestRevoke,
  isAdmin,
  isOwner,
  coders,
  assigning,
  handleAssignCoder,
  blockedByAssignment,
  onRequestStatusChange,
  canStartProduction,
}) {
  const hasProductionTasks = (wo.production_tasks || []).length > 0;
  const canAdminReopen = ['READY_TO_CLOSE', 'COMPLETED'].includes(wo.status);
  const adminStatusOptions = wo.status === 'READY_TO_CLOSE'
    ? ['READY_TO_CLOSE', 'ANALYZED', ...(hasProductionTasks ? ['FINALIZED', 'PRODUCTION'] : []), 'COMPLETED']
    : ['COMPLETED', 'ANALYZED', ...(hasProductionTasks ? ['FINALIZED', 'PRODUCTION'] : [])];

  return (
    <>
      <div className="flex justify-between align-center mb-16">
        <h1>{wo.wo_number}</h1>
        {(
          (canEdit && !['FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE', 'COMPLETED'].includes(wo.status)) ||
          ((isAdmin || isOwner) && wo.status === 'ANALYZED') || canStartProduction ||
          (isCoder && !blockedByAssignment && wo.status === 'PRODUCTION')
        ) && (
          <div className="flex gap-8">
            {canEdit && !['FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE', 'COMPLETED'].includes(wo.status) && (
              <Link className="icon-btn" to={`/work-orders/${wo.id}/edit`} title="Edit Work Order" aria-label="Edit Work Order"><Pencil size={16} strokeWidth={1.5} /></Link>
            )}
            {(isAdmin || isOwner) && wo.status === 'ANALYZED' && (
              <button className="btn" onClick={openFinalizeConfirm} disabled={finalizing || countOpenItem > 0} title={countOpenItem > 0 ? `${countOpenItem} item(s) awaiting coder review` : undefined}>
                {finalizing
                  ? (allNonFirmware ? 'Completing...' : 'Finalizing...')
                  : reviewedItems}
              </button>
            )}
            {canStartProduction && wo.status === 'FINALIZED' && (
              <button className="btn" onClick={openStartConfirm} disabled={startingProduction}>
                {startingProduction ? 'Starting...' : 'Start Production'}
              </button>
            )}
            {isCoder && !blockedByAssignment && wo.status === 'PRODUCTION' && (
              <button className="btn" onClick={openCompleteConfirm} disabled={completing || openTaskCount > 0}>
                {completing ? 'Completing...' : completeAllLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel mb-16">
        <h3>Work Order Details</h3>
        <div className="form-grid">
          <div>
            <span className="text-muted">Status: {''}</span>
            {isAdmin && canAdminReopen ? (
              <select
                className={`wo-input-text status-select ${statusBadgeMeta(wo.status).cls}`}
                style={{ marginTop: 4}}
                value={wo.status}
                disabled={changingStatus}
                aria-label="Change work order status"
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  if (!nextStatus || nextStatus === wo.status) return;
                  onRequestStatusChange(nextStatus);
                }}
              >
                {adminStatusOptions.map((status) => (
                  <option key={status} value={status}> {statusBadgeMeta(status || '').label}</option>
                ))}
              </select>
            ) : (
              <StatusBadge status={wo.status} />
            )}
          </div>
          
          <div><span className="text-muted">Customer:</span> {wo.customer || '-'}</div>
          <div><span className="text-muted">Created By:</span> {wo.created_by_name || '-'}</div>
          <div><span className="text-muted">Created At:</span> {new Date(wo.created_at).toLocaleString()}</div>
          <div>
              <span className="text-muted">Assigned Engineer:</span> {wo.assigned_coder_name || 'Unassigned'}
              {isAdmin && (
                <select
                  className="wo-input-text"
                  style={{ marginTop:4}}
                  value={wo.assigned_coder_id || ''}
                  disabled={assigning}
                  onChange={(e) => handleAssignCoder(e.target.value)}
                >
                  <option value="">Select User</option>
                  {coders.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name} </option>
                  ))}
                </select>
              )}
            </div>
        </div>
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
                      <button className="btn btn-danger btn-sm" disabled={accessBusy === a.user_id} onClick={() => onRequestRevoke(a)}>
                        {accessBusy === a.user_id ? 'Removing...' : 'Remove'}
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