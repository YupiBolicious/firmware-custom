import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import useWorkOrderDetail from './useWorkOrderDetail';

const ALLOWED_EXTENSIONS = '.pdf,.doc,.docx,.zip,.7z';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function DocumentUpload({ uploading, onUpload }) {
  const [files, setFiles] = useState(null);
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!files || files.length === 0) return;
    onUpload(files, description || undefined);
    setFiles(null);
    setDescription('');
  };

  return (
    <div style={{ marginBottom: 12, padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333' }}>
      <div className="form-row">
        <label>Select files</label>
        <input
          type="file"
          accept={ALLOWED_EXTENSIONS}
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />
      </div>
      <div className="form-row">
        <label>Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Final firmware binary, test report..."
        />
      </div>
      <button className="btn btn-sm" onClick={handleSubmit} disabled={!files || files.length === 0 || uploading}>
        {uploading ? 'Uploading...' : `Upload${files ? ` (${files.length})` : ''}`}
      </button>
    </div>
  );
}

export default function WorkOrderDetail() {
  const { hasRole } = useAuth();
  const isCoder = hasRole('CODER');
  const { wo, error, loading, analyzing, finalizing, startingProduction, completing, savingTaskId, uploading, analysis, message, itemForm,
    editingItemId, handleItemChange, handleEditItem, handleUpdateItem, cancelEdit,
    showAddItemForm, openAddItem, handleAddItem, handleDeleteItem, handleAnalyze, handleFinalize,
    handleStartProduction, handleCompleteProduction, handleCompleteTask, documents, handleUploadDocuments, handleDeleteDocument,
    groupForm, editingGroupId, showAddGroup, handleGroupFormChange, openAddGroup, openEditGroup,
    cancelGroupForm, handleSubmitGroup, handleDeleteGroup,
    access, accessBusy, users, canEdit, canManageAccess, isOwner, isAdmin,
    handleGrantAccess, handleRevokeAccess } = useWorkOrderDetail();

  if (loading) return <div>Loading...</div>;
  if (error && !wo) return <div className="alert alert-error">{error}</div>;
  if (!wo) return <div className="alert alert-error">Work order not found</div>;

  const productionTasks = wo.production_tasks || [];
  const openTaskCount = productionTasks.filter((t) => !t.completed).length;
  const completeAllLabel = openTaskCount > 0
    ? `Complete (${openTaskCount} item${openTaskCount === 1 ? '' : 's'} left)`
    : 'Complete Production';

  const items = wo.items || [];
  const groups = wo.groups || [];
  const groupsEditable = wo.status === 'DRAFT' || wo.status === 'ANALYZED';
  const itemsByGroup = groups.map((group) => ({ ...group, items: items.filter((i) => i.work_order_group_id === group.id) }));
  const summary = analysis?.summary || null;

  return (
    <div>
      <div className="flex justify-between align-center mb-16">
        <h1>{wo.wo_number}</h1>
        <div className="flex gap-8">
          <Link className="btn btn-secondary" to={isCoder ? '/review-queue' : '/work-orders'}>
            {isCoder ? 'Back to Review Queue' : 'Back to List'}
          </Link>
          {canEdit && wo.status !== 'FINALIZED' && wo.status !== 'PRODUCTION' && wo.status !== 'COMPLETED' && (
            <Link className="btn btn-secondary" to={`/work-orders/${wo.id}/edit`}>Edit Work Order</Link>
          )}
          {canEdit && wo.status === 'ANALYZED' && (
            <button className="btn" onClick={handleFinalize} disabled={finalizing}>
              {finalizing ? 'Finalizing...' : 'Finalize Work Order'}
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

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <h3>Work Order Details</h3>
        <div className="form-grid">
          <div><span className="text-muted">Status:</span> <StatusBadge status={wo.status} /></div>
          <div><span className="text-muted">Customer:</span> {wo.customer || '-'}</div>
          <div><span className="text-muted">Title:</span> {wo.title || '-'}</div>
          <div><span className="text-muted">Created By:</span> {wo.created_by_name || '-'}</div>
          <div><span className="text-muted">Created At:</span> {new Date(wo.created_at).toLocaleString()}</div>
          {['ANALYZED', 'FINALIZED'].includes(wo.status) && (
            <div><span className="text-muted">Total Estimated Hours:</span> {wo.total_estimated_hours}h</div>
          )}
        </div>
        {wo.description && <div className="mt-8 text-muted">{wo.description}</div>}
      </div>

      {/* Access Management */}
      {canManageAccess && (
        <div className="panel">
          <div className="flex justify-between align-center mb-16">
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

      {/* models & Items */}
      <div className="panel">
        <div className="flex justify-between align-center mb-8">
          <h3>Models and Custom Items</h3>
          {canEdit && (
            <div className="item-actions">
              <button className="btn" onClick={handleAnalyze} disabled={analyzing || finalizing || items.length === 0 || (wo.status !== 'DRAFT' && wo.status !== 'ANALYZED')}>
                {analyzing ? 'Analyzing...' : 'Estimate Work Order'}
              </button>
              {groupsEditable && (
                <button className="btn btn-secondary" type="button" onClick={openAddGroup}>
                  + Add Model
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit / Add Item Form */}
        {canEdit && (editingItemId || showAddItemForm) && (
          <div style={{ marginTop: 12, marginBottom: 12, padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333' }}>
            <h3>{editingItemId ? 'Edit Item' : 'Add Custom Item'}</h3>
            <form onSubmit={editingItemId ? handleUpdateItem : handleAddItem}>
            <div className="form-grid">
              <div className="form-row">
                <label>Quantity</label>
                <input
                  className="custom-item-text"
                  name="quantity"
                  type="number"
                  min="1"
                  value={itemForm.quantity}
                  onChange={handleItemChange}
                  disabled={wo.status === 'FINALIZED'}
                />
              </div>
              {!editingItemId && (
              <div className="form-row">
                <label>Model/Ver/SN</label>
                <select className="wo-input-text" name="work_order_group_id" value={itemForm.work_order_group_id} onChange={handleItemChange} required>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.machine_model_code || '—'}{g.machine_model_version ? ` / ${g.machine_model_version}` : ''}{g.serial_number ? ` / SN: ${g.serial_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              )}
              <div className="form-row">
                <label>Title</label>
                <input className='custom-item-text' name="title" value={itemForm.title} onChange={handleItemChange} required disabled={wo.status === 'FINALIZED'} />
              </div>
            </div>
              <div className="form-row">
                <label>Description</label>
                <textarea className="custom-item-text" name="description" value={itemForm.description} onChange={handleItemChange} disabled={wo.status === 'FINALIZED'} />
              </div> 
         
            
            <div className="flex gap-8">
                <button className="btn" type="submit" disabled={wo.status === 'FINALIZED'}>{editingItemId ? 'Update Item' : 'Add Item'}</button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Add / Edit Model */}
        {canEdit && showAddGroup && (
          <div className="panel" style={{ marginTop: 12, marginBottom: 12 }}>
            <h3>{editingGroupId ? 'Edit Model' : 'Add Model'}</h3>
            <form onSubmit={handleSubmitGroup}>
              <div className="form-grid">
                <div className="form-row">
                  <label>Machine Model</label>
                  <input className="wo-input-text sn-input" name="machine_model_id" value={groupForm.machine_model_id} onChange={handleGroupFormChange} placeholder="e.g. FWX-100" required />
                </div>
                <div className="form-row">
                  <label>Version</label>
                  <input className="wo-input-text sn-input" name="machine_model_version_id" value={groupForm.machine_model_version_id} onChange={handleGroupFormChange} placeholder="e.g. v1.0" required />
                </div>
              </div>
              <div className="form-row">
                <label>Serial Number (optional)</label>
                <input className="wo-input-text sn-input" name="serial_number" value={groupForm.serial_number} onChange={handleGroupFormChange} />
              </div>
              <div className="flex gap-8">
                <button className="btn" type="submit">{editingGroupId ? 'Update Model' : 'Add Model'}</button>
                <button className="btn btn-secondary" type="button" onClick={cancelGroupForm}>Cancel</button>
              </div>
            </form>
            </div>
        )}

        {groups.length === 0 ? (
          <div className="text-muted">
            No groups yet. Use &quot;Add Model&quot; to create the first Model / Version / Serial-Number unit.
          </div>
        ) : (
          itemsByGroup.map((group) => (
            <div key={group.id} className="panel" style={{ marginBottom: 12, padding: 12 }}>
              <div className="flex justify-between align-center mb-8">
                <strong>
                  {group.machine_model_code || '—'} {group.machine_model_version ? `/ ${group.machine_model_version}` : ''}
                  {group.serial_number ? ` / SN: ${group.serial_number}` : ''}
                </strong>
                {canEdit && groupsEditable && (
                  <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditGroup(group)}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGroup(group.id)} disabled={group.items.length > 0}>Delete</button>
                  </div>
                )}
              </div>

              {group.items.length === 0 ? (
                <div className="text-muted mb-8">No custom items in this group.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Title</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Firmware</th>
                      <th>Complexity</th>
                      <th>Confidence</th>
                      <th>Hours</th>
                      <th>Status</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.item_number}</td>
                        <td>{item.title}</td>
                        <td>{item.description || '-'}</td>
                        <td>{item.quantity}</td>
                        <td>
                          {item.fw_related === true ? 'YES' : item.fw_related === false ? 'NO' : '-'}
                        </td>
                        <td>{item.complexity_code || '-'}</td>
                        <td>{item.confidence_score != null ? `${item.confidence_score}%` : '-'}</td>
                        <td>{item.estimated_hours != null ? `${item.estimated_hours}h` : 'N/A'}</td>
                        <td><StatusBadge status={item.classification_status} /></td>
                        {canEdit && <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditItem(item)} disabled={wo.status !== 'DRAFT' && wo.status !== 'ANALYZED'}>Edit</button>{' '}
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item.id)} disabled={wo.status !== 'DRAFT' && wo.status !== 'ANALYZED'}>Delete</button>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {canEdit && groupsEditable && (
                <button className="btn btn-secondary btn-sm mt-8" type="button" onClick={() => openAddItem(group.id)}>
                  + Add Item
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Estimation Preview */}
      {analysis && (
        <div className="panel">
          <h3>Estimation Preview</h3>
          <div className="stats-grid">
            <div className="stat">
              <div className="label">Total Items</div>
              <div className="value">{summary.total_items}</div>
            </div>
            <div className="stat">
              <div className="label">Firmware Items</div>
              <div className="value">{summary.firmware_items}</div>
            </div>
            <div className="stat">
              <div className="label">Non-Firmware Items</div>
              <div className="value">{summary.non_firmware_items}</div>
            </div>
            <div className="stat">
              <div className="label">Waiting for Review</div>
              <div className="value">{summary.waiting_review}</div>
            </div>
            <div className="stat">
              <div className="label">Total Estimated Hours</div>
              <div className="value">{summary.total_estimated_hours}</div>
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
                <th>Confidence</th>
                <th>Hours</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {analysis.results.map((r) => (
                <tr key={r.item_id}>
                  <td>{r.item_number}</td>
                  <td>
                    {[r.machine_model_code, r.machine_model_version, r.serial_number ? `SN: ${r.serial_number}` : null].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td>{r.title}</td>
                  <td>{r.fw_related === true ? 'YES' : r.fw_related === false ? 'NO' : 'Pending'}</td>
                  <td>{r.complexity_code || '-'}</td>
                  <td>{r.confidence_score != null ? `${r.confidence_score}%` : '-'}</td>
                  <td>{r.estimated_hours != null ? `${r.estimated_hours}h` : 'N/A'}</td>
                  <td>{r.quantity || '-'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-muted">{r.classification_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {productionTasks.length > 0 && ['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status) && (
        <div className="panel">
          <h3 className="mb-16">
            Production Tasks
            <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
              {productionTasks.filter((t) => t.completed).length} of {productionTasks.length} completed
            </span>
          </h3>
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Item</th>
                <th>Title</th>
                <th>Status</th>
                {isCoder && wo.status === 'PRODUCTION' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {productionTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.task_code}</td>
                  <td>{task.work_order_item_id}</td>
                  <td>{task.title}</td>
                  <td>
                    {task.completed
                      ? <span className="badge badge-success">Done</span>
                      : <span className="badge badge-muted">Open</span>}
                  </td>
                  {isCoder && wo.status === 'PRODUCTION' && (
                    <td>
                      <button
                        className={`btn btn-sm ${task.completed ? 'btn-secondary' : ''}`}
                        onClick={() => handleCompleteTask(task.id, !task.completed)}
                        disabled={savingTaskId === task.id}
                      >
                        {savingTaskId === task.id ? 'Saving...' : task.completed ? 'Reopen' : 'Mark Done'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents */}
      {(wo.status === 'PRODUCTION' || wo.status === 'COMPLETED') && (
        <div className="panel">
          <h3 className="mb-16">Documentation File</h3>
          {isCoder && wo.status === 'PRODUCTION' && (
            <DocumentUpload uploading={uploading} onUpload={handleUploadDocuments} />
          )}
          {documents.length === 0 ? (
            <div className="text-muted">{wo.status === 'PRODUCTION' ? 'No documents uploaded yet.' : 'No documents.'}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Uploaded By</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.original_name}</strong></td>
                    <td>{formatBytes(doc.size_bytes)}</td>
                    <td>{doc.uploaded_by_name || '-'}</td>
                    <td className="text-muted">{new Date(doc.created_at).toLocaleString()}</td>
                    <td>
                      <a className="btn btn-secondary btn-sm" href={`/api/work-orders/${wo.id}/documents/${doc.id}/download?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer">Download</a>
                      {isCoder && wo.status === 'PRODUCTION' && (
                        <>{' '}<button className="btn btn-danger btn-sm" onClick={() => handleDeleteDocument(doc.id)}>Delete</button></>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}