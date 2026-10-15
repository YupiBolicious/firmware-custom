import { useValueToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import useWorkOrderCreate from './useWorkOrderCreate';

export default function WorkOrderCreate() {
  const {
    form,
    error,
    loading,
    saving,
    isEditMode,
    duplicate,
    permissionError,
    handleChange,
    handleSubmit,
    handleCancel,
    handleOpenExisting,
    handleDismissDuplicate,
    handleConfirmOverwrite,
    handleDismissPermission,
  } = useWorkOrderCreate();
  useValueToast(error);

  return (
    <div className="glass-page">
      <h1>{isEditMode ? 'Edit Work Order' : 'Create Work Order'}</h1>
      
      <div className='flex justify-center'>
        <div className="panel flex-1" style={{ maxWidth: 700 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>WO Number</label>
              <input className="wo-number-input" name="wo_number" value={form.wo_number} onChange={handleChange} placeholder="2026002" required disabled={isEditMode} />
            </div>
            
            <div className="form-row">
              <label style={{ marginBottom: 4 }}>Model Code</label>
              <input className="wo-input-text sn-input" name="model" value={form.model} onChange={handleChange} placeholder="e.g. FWX-100" required readOnly={isEditMode} />
              {isEditMode && (
                <small className="form-help" style={{color: '#6b7280', opacity: 0.7, fontWeight: 500}}>
                  Managed on the Work Order page.
                </small>
              )}
            </div>
            <div className="form-row">
              <label style={{ marginBottom: 4 }}>Serial Number(s)</label>
              <input
                className="wo-input-text sn-input"
                name="serial_numbers"
                value={form.serial_numbers || ''}
                onChange={handleChange}
                placeholder="e.g. SN001, SN002, SN003"
                required
                readOnly={isEditMode}
              />
              <small className="form-help" style={{color: '#6b7280', opacity: 0.7, fontWeight: 500}}>
                {isEditMode
                  ? 'Managed on the Work Order page: add, edit or remove serial numbers individually.'
                  : 'Enter multiple serial numbers separated by commas.'}
              </small>
            </div>

            <div className="form-row">
              <label htmlFor="itemsText">Customization Items</label>
              <textarea
                id="itemsText"
                className="wo-input-text"
                name="itemsText"
                value={form.itemsText}
                onChange={handleChange}
                placeholder="Item one, Item two, Item three"
                rows={4}
                readOnly={isEditMode}
              />
              <small className="form-help" style={{color: '#6b7280', opacity: 0.7, fontWeight: 500}}>
                {isEditMode
                  ? 'Managed on the Work Order page: add, edit or remove custom items individually.'
                  : 'Separate items with commas.'}
              </small>
            </div>
            <div className='form-grid' style={{marginBottom:12}}>
              <div>
                <label>Customer</label>
                <input className="wo-input-text" name="customer" value={form.customer} onChange={handleChange} />
              </div>

              <div>
                <label>Revision</label>
                <input
                  className="wo-input-text"
                  type="number"
                  min="0"
                  name="revision"
                  value={form.revision}
                  onChange={handleChange}
                  readOnly={isEditMode}
                />
                <small className="form-help" style={{color: '#6b7280', opacity: 0.7, fontWeight: 500}}>
                  {isEditMode
                    ? 'Managed via upload/preview.'
                    : ''}
                </small>
              </div>
            </div>
            <div className="flex gap-8">
              <button className="btn" type="submit" disabled={loading || saving}>
                {saving ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update' : 'Create')}
              </button>
              <button className="btn btn-secondary" type="button" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {duplicate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="panel" style={{ maxWidth: 440, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>Work order already exists</h2>
            <p>
              <strong>{form.wo_number.trim().toUpperCase()}</strong> already exists at revision{' '}
              <strong>{duplicate.existing_revision}</strong> (status {duplicate.existing_status}).
            </p>
            <p> Overwriting will reset its status to DRAFT.</p>
            <div className="flex gap-8 mt-8">
              <button className=" btn btn-danger" type="button" onClick={handleConfirmOverwrite} disabled={saving}>
                {saving ? 'Overwriting...' : 'Overwrite and reset'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={handleOpenExisting}>Open existing</button>
              <button className="btn btn-secondary" type="button" onClick={handleDismissDuplicate}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!permissionError}
        title="Can’t edit this work order"
        message={permissionError}
        confirmLabel="OK"
        hideCancel
        onConfirm={handleDismissPermission}
        onClose={handleDismissPermission}
      />
    </div>
  );
}