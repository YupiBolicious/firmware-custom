import { Pencil, Trash2 } from 'lucide-react';

export default function WOModelSerial({
  wo,
  canEdit,
  groups,
  groupsEditable,
  handleAnalyze,
  analyzing,
  finalizing,
  items,
  openAddGroup,
  openEditGroup,
  handleDeleteGroup,
  showAddGroup,
  editingGroupId,
  handleSubmitGroup,
  groupForm,
  handleGroupFormChange,
  cancelGroupForm
}) {
  return (
    <div className="panel table-scroll mb-16">
      <div className="flex justify-between align-center mb-8">
        <h3>Model Code &amp; Serial Numbers</h3>
        {canEdit && (
          <div className="item-actions">
            <button className="btn" onClick={handleAnalyze} disabled={analyzing || finalizing || items.length === 0 || (wo.status !== 'DRAFT' && wo.status !== 'ANALYZED')}>
              {analyzing ? 'Analyzing...' : 'Estimate Work Order'}
            </button>
            {groupsEditable && groups.length > 0 && (
              <button className="btn btn-secondary" type="button" onClick={openAddGroup}>
                + Add Serial Number
              </button>
            )}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="text-muted">
          No Model yet. Use Edit on this work order to set the model and its serial numbers.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Model Code</th>
              <th>Serial Number</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td>{group.machine_model_code || '—'}</td>
                <td>{group.serial_number || '—'}</td>
                {canEdit && (
                  <td>
                    <button className="icon-btn" onClick={() => openEditGroup(group)} disabled={!groupsEditable} title="Edit serial number" aria-label="Edit serial number"><Pencil size={16} strokeWidth={1.5} /></button>
                    <button className="icon-btn icon-btn-danger" onClick={() => handleDeleteGroup(group.id)} disabled={!groupsEditable || group.item_count > 0} title={group.item_count > 0 ? 'Serial number still referenced by legacy items' : 'Delete serial number'} aria-label="Delete serial number"><Trash2 size={16} strokeWidth={1.5} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit Serial Number */}
      {canEdit && showAddGroup && (
        <div className="glass-card" style={{ marginTop: 12 }}>
          <h3>{editingGroupId ? 'Edit Serial Number' : 'Add Serial Number'}</h3>
          <form onSubmit={handleSubmitGroup}>
            <div className="form-grid">
              <div className="form-row">
                <label>Machine Model</label>
                <input
                  className="wo-input-text sn-input"
                  name="machine_model_id"
                  value={groupForm.machine_model_id}
                  onChange={handleGroupFormChange}
                  placeholder="e.g. FWX-100"
                  required
                  readOnly={groups.length > 0}
                  title={groups.length > 0 ? 'A work order holds exactly one machine model' : undefined}
                />
              </div>
              <div className="form-row">
                <label>Serial Number</label>
                <input className="wo-input-text sn-input" name="serial_number" value={groupForm.serial_number} onChange={handleGroupFormChange} />
              </div>
            </div>
            <div className="flex gap-8">
              <button className="btn" type="submit">{editingGroupId ? 'Update' : 'Add Serial Number'}</button>
              <button className="btn btn-secondary" type="button" onClick={cancelGroupForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
