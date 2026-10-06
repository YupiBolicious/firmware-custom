import { useValueToast } from '../components/Toast';
import useWorkOrderCreate from './useWorkOrderCreate';

export default function WorkOrderCreate() {
  const {
    form,
    error,
    loading,
    saving,
    isEditMode,
    handleChange,
    handleSubmit,
    handleCancel,
  } = useWorkOrderCreate();
  useValueToast(error);

  return (
    <div className="glass-page">
      <h1>{isEditMode ? 'Edit Work Order' : 'Create Work Order'}</h1>
      
      <div className="panel" style={{ maxWidth: 700 }}>
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
          <div className="form-row">
            <label>Customer</label>
            <input className="wo-input-text" name="customer" value={form.customer} onChange={handleChange} />
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
  );
}