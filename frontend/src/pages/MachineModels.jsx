import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, X } from 'lucide-react';
import useMachineModels from './useMachineModels';

export default function MachineModels() {
  const {
    models,
    loading,
    error,
    expandedId,
    versions,
    modelForm,
    editingModelId,
    versionForm,
    editingVersionId,
    setModelForm,
    setVersionForm,
    toggleExpand,
    handleSaveModel,
    handleDeleteModel,
    handleEditModel,
    handleCancelEditModel,
    handleSaveVersion,
    handleDeleteVersion,
    handleEditVersion,
    handleCancelEditVersion,
  } = useMachineModels();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Machine Models</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel mb-16">
        <h3>{editingModelId ? 'Edit Model' : 'Add Model'}</h3>
        <form onSubmit={handleSaveModel}>
          <div className="form-grid">
            <div className="form-row">
              <label>Serial Number</label>
              <input className="wo-input-text" value={modelForm.model_code} onChange={(e) => setModelForm({ ...modelForm, model_code: e.target.value.toUpperCase() })} placeholder="FWX-100" required />
            </div>
            <div className="form-row">
              <label>Name</label>
              <input className="wo-input-text" value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <label>Description</label>
            <input className="wo-input-text" value={modelForm.description} onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })} />
          </div>
          <div className="flex gap-8">
            <button className="btn" type="submit">{editingModelId ? 'Update' : 'Add'}</button>
            {editingModelId && (
              <button className="btn btn-secondary" type="button" onClick={handleCancelEditModel}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>Models List</h3>
        {models.length === 0 ? (
          <div className="text-muted">No models found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Versions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <>
                  <tr key={m.id}>
                    <td>{m.model_code}</td>
                    <td>{m.name}</td>
                    <td className="text-muted">{m.description || '-'}</td>
                    <td>{m.version_count}</td>
                    <td>
                      <span className="icon-actions">
                        <button className="icon-btn" title="Versions" onClick={() => toggleExpand(m.id)}>
                          {expandedId === m.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => handleEditModel(m)}>
                          <Pencil size={16} />
                        </button>
                        <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDeleteModel(m.id)}>
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </td>
                  </tr>
                  {expandedId === m.id && (
                    <tr key={`${m.id}-versions`}>
                      <td colSpan={5} style={{ padding: 12, background: '#1a1a1a' }}>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>Versions for {m.model_code}</div>
                        <form onSubmit={handleSaveVersion} style={{ marginBottom: 8 }}>
                          <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                            <div className="form-row" style={{ marginBottom: 8 }}>
                              <label>Version Code</label>
                              <input className="wo-input-text" value={versionForm.version_code} onChange={(e) => setVersionForm({ ...versionForm, version_code: e.target.value })} placeholder="v1.0" required />
                            </div>
                            <div className="form-row" style={{ marginBottom: 8 }}>
                              <label>Description</label>
                              <input className="wo-input-text" value={versionForm.description} onChange={(e) => setVersionForm({ ...versionForm, description: e.target.value })} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button className="btn btn-sm" type="submit">
                              {editingVersionId ? 'Update' : 'Add'}
                            </button>
                            {editingVersionId && (
                              <button
                                className="btn btn-secondary btn-sm"
                                type="button"
                                onClick={handleCancelEditVersion}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </form>
                        {versions.length === 0 ? (
                          <div className="text-muted">No versions.</div>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>Version</th>
                                <th>Description</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {versions.map((v) => (
                                <tr key={v.id}>
                                  <td>{v.version_code}</td>
                                  <td className="text-muted">{v.description || '-'}</td>
                                  <td>
                                    <span className="icon-actions">
                                      <button className="icon-btn" title="Edit" onClick={() => handleEditVersion(v)}>
                                        <Pencil size={16} />
                                      </button>
                                      <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDeleteVersion(v.id)}>
                                        <Trash2 size={16} />
                                      </button>
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
