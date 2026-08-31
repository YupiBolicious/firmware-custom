import useWorkOrderCreate from './useWorkOrderCreate';

export default function WorkOrderCreate() {
  const {
    form,
    error,
    loading,
    saving,
    isEditMode,
    handleChange,
    handleGroupFieldChange,
    addGroup,
    removeGroup,
    handleSubmit,
    handleCancel,
  } = useWorkOrderCreate();

  return (
    <div>
      <h1>{isEditMode ? 'Edit Work Order' : 'Create Work Order'}</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="panel" style={{ maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>WO Number</label>
            <input className="wo-number-input" name="wo_number" value={form.wo_number} onChange={handleChange} placeholder="WO-2026-002" required disabled={isEditMode} />
          </div>
          <div className="form-row">
            <label>Title (optional)</label>
            <input className="wo-input-text" name="title" value={form.title} onChange={handleChange} />
          </div>

          {isEditMode ? (
            <div className="form-row">
              <label>Groups</label>
              <div>
                {form.groups.length > 0 ? form.groups.map((group, index) => (
                  <div key={index} className="text-muted" style={{ marginBottom: 4 }}>
                    {group.machine_model_id ? `${group.machine_model_id} / ${group.machine_model_version_id}` : '—'}
                    {group.serial_number ? ` / SN: ${group.serial_number}` : ''}
                  </div>
                )) : <span className="text-muted">No groups (manage groups from the work order page).</span>}
              </div>
            </div>
          ) : (
            <div className="form-row">
              <div className="flex justify-between align-center mb-8">
                <label style={{ marginBottom: 0 }}>Groups (Model / Version / SN)</label>
                <button className="btn btn-secondary btn-sm" type="button" onClick={addGroup}>+ Add Model</button>
              </div>
              {form.groups.map((group, index) => (
                <div key={index} className="group-editor">
                  <input className='wo-input-text sn-input' value={group.machine_model_id}
                  onChange={(e) => handleGroupFieldChange(index, 'machine_model_id', e.target.value )}
                  placeholder='Machine Model'
                  required>
                  </input>
                  <input className='wo-input-text sn-input' value={group.machine_model_version_id}
                  onChange={(e) => handleGroupFieldChange(index, 'machine_model_version_id', e.target.value )}
                  placeholder='Machine Model Version'
                  required>
                  </input>
                  <input
                    className="wo-input-text sn-input"
                    value={group.serial_number}
                    onChange={(e) => handleGroupFieldChange(index, 'serial_number', e.target.value)}
                    placeholder="Serial number (optional)"
                  />
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => removeGroup(index)}
                    disabled={form.groups.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="form-row">
            <label>Description</label>
            <textarea className="wo-input-text" name="description" value={form.description} onChange={handleChange} />
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