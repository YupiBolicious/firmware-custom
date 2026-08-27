import useWorkOrderCreate from './useWorkOrderCreate';

export default function WorkOrderCreate() {
  const {
    form,
    error,
    loading,
    saving,
    isEditMode,
    models,
    versions,
    handleChange,
    handleSubmit,
    handleCancel,
  } = useWorkOrderCreate();
  
  return (
    <div>
      <h1>{isEditMode ? 'Edit Work Order' : 'Create Work Order'}</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="panel" style={{ maxWidth: 600 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>WO Number</label>
            <input className="wo-number-input" name="wo_number" value={form.wo_number} onChange={handleChange} placeholder="WO-2026-002" required disabled={isEditMode} />
          </div>
          <div className="form-row">
            <label>Title</label>
            <input className="wo-input-text" name="title" value={form.title} onChange={handleChange} required />
          </div>
          <div className="form-row">
            <label>Machine Model</label>
            <select className="wo-input-text" name="machine_model_id" value={form.machine_model_id} onChange={handleChange} required>
              <option value="">Select model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.model_code} - {m.name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Version</label>
            <select className="wo-input-text" name="machine_model_version_id" value={form.machine_model_version_id} onChange={handleChange} required disabled={!form.machine_model_id}>
              <option value="">Select version...</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.version_code}{v.description ? ` - ${v.description}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea className="wo-input-text" name="description" value={form.description} onChange={handleChange} />
          </div>
          <div className="form-row">
            <label>Customer</label>
            <input className="wo-input-text" name="customer" value={form.customer} onChange={handleChange}/>
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