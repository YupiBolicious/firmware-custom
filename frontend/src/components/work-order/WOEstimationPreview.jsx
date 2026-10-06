import { Pencil, Trash2 } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import { reviewReasonLabel, blockReasonLabel } from '../../lib/reviewLabels';

export default function WOEstimationPreview({
  items,
  totalEstimatedHours,
  groups,
  canEdit,
  itemsEditable,
  showAddItemForm,
  openAddItem,
  handleAddItem,
  itemForm,
  handleItemChange,
  editingItemId,
  handleEditItem,
  handleUpdateItem,
  cancelEdit,
  handleDeleteItem
}) {
  const editable = canEdit && itemsEditable;
  // A work order holds exactly one machine model, so it belongs in the header rather than
  // repeated down a column that is null for every WO-level item anyway.
  const woModel = groups && groups[0] ? groups[0].machine_model_code : null;

  // Counts the analyze endpoint used to return in analysis.summary, derived from the
  // items already loaded with the work order.
  const summary = {
    total_items: items.length,
    firmware_items: items.filter((i) => i.fw_related === true).length,
    non_firmware_items: items.filter((i) => i.fw_related === false).length,
    waiting_review: items.filter((i) => i.classification_status === 'CODER_REVIEW').length,
    total_estimated_hours: totalEstimatedHours,
  };

  return (
    <div className="panel table-scroll mb-16">
      <div className="flex justify-between align-center mb-8">
        <h3>
          Custom Items &amp; Estimation
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
            {woModel ? `${woModel} · ` : ''}{items.length} item{items.length === 1 ? '' : 's'}
          </span>
        </h3>
        {editable && (
          <button className="btn btn-secondary" type="button" onClick={openAddItem}>
            + Add New
          </button>
        )}
      </div>

      <div className="stats-grid compact mb-16">
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
            <th>Title</th>
            <th>Firmware</th>
            <th>Complexity</th>
            <th>Hours</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Review</th>
            <th>Assistance</th>
            {editable && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const inReview = r.classification_status === 'CODER_REVIEW';
            const marginPct = r.assist_semantic_margin != null ? `${(Number(r.assist_semantic_margin) * 100).toFixed(1)}` : null;
            return (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.fw_related === true ? 'YES' : r.fw_related === false ? 'NO' : 'Pending'}</td>
              <td>
                {inReview && r.assist_complexity_code
                  ? `${r.assist_complexity_code} (Prov.)`
                  : r.complexity_code || '-'}
              </td>
              <td>
                {inReview
                  ? (r.provisional_hours != null ? `${r.provisional_hours}h (Prov.)` : 'Awaiting Coder Review')
                  : `${r.estimated_hours}h`}
              </td>
              <td>{r.quantity || '-'}</td>
              <td><StatusBadge status={r.classification_status} /></td>
              <td>
                {inReview
                  ? (reviewReasonLabel(r.review_reason) || r.classification_reason || '-')
                  : '-'}
              </td>
              
              <td>
                {inReview && r.assist_match_score != null
                  ? `${r.assist_match_score}% sim${marginPct != null ? ` · margin ${marginPct}` : ''}`
                  : '-'}
              </td>
              {editable && (
                <td>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="icon-btn" onClick={() => handleEditItem(r)} title="Edit item" aria-label="Edit item"><Pencil size={16} strokeWidth={1.5} /></button>
                    <button className="icon-btn icon-btn-danger" onClick={() => handleDeleteItem(r.id)} title="Delete item" aria-label="Delete item"><Trash2 size={16} strokeWidth={1.5} /></button>
                  </div>
                </td>
              )}
            </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={editable ? 10 : 9} className="text-muted">No custom items yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {editable && (showAddItemForm || editingItemId) && (
        <div className="glass-card" style={{ marginTop: 12 }}>
          <h3>{editingItemId ? 'Edit Custom Item' : 'Add Custom Item'}</h3>
          <form onSubmit={editingItemId ? handleUpdateItem : handleAddItem}>
            <div className="form-grid">
              <div className="form-row">
                <label>Customization Item</label>
                <input className="wo-input-text" name="title" value={itemForm.title} onChange={handleItemChange} required />
              </div>
              <div className="form-row">
                <label>Quantity</label>
                <input className="wo-input-text" name="quantity" type="number" min="1" step="1" value={itemForm.quantity} onChange={handleItemChange} />
              </div>
              
            </div>
            <div className="flex gap-8">
              <button className="btn" type="submit">{editingItemId ? 'Update' : 'Add'}</button>
              <button className="btn btn-secondary" type="button" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}