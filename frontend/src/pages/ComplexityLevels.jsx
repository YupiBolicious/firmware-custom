import { ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useComplexityLevels from './useComplexityLevels';

const hourFields = [
  { key: 'requirement_review_h', label: 'Req. Review' },
  { key: 'code_development_h', label: 'Code Dev' },
  { key: 'peer_review_fixing_h', label: 'Peer Review' },
  { key: 'bench_testing_h', label: 'Bench Test' },
  { key: 'unit_testing_h', label: 'Unit Test' },
];

export default function ComplexityLevels() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const {
    levels,
    loading,
    error,
    form,
    editingId,
    showForm,
    setForm,
    toggleShowForm,
    handleSave,
    handleDelete,
    handleEdit,
    handleCancelEdit,
  } = useComplexityLevels();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Complexity Levels</h1>
      {/* <div className="text-muted mb-16">
        Fixed estimation hours
      </div> */}
      {error && <div className="alert alert-error">{error}</div>}

      {isAdmin && (
        showForm ? (
          <div className="panel mb-16">
            <div className="flex justify-between align-center mb-16">
              <h3 style={{ margin: 0 }}>{editingId ? 'Edit Complexity Level' : 'Add Complexity Level'}</h3>
              <button className="icon-btn" title="Collapse" onClick={toggleShowForm}>
                <ChevronUp size={16} />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-row">
                  <label>Code</label>
                  <input className="wo-input-text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="L6" required />
                </div>
                <div className="form-row">
                  <label>Name</label>
                  <input className="wo-input-text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <label>Description</label>
                <input className="wo-input-text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-grid">
                {hourFields.map((f) => (
                  <div className="form-row" key={f.key}>
                    <label>{f.label}</label>
                    <input className="wo-input-text" type="number" min="0" step="0.25" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-8">
                <button className="btn" type="submit">{editingId ? 'Update' : 'Add'}</button>
                {editingId && (
                  <button className="btn btn-secondary" type="button" onClick={handleCancelEdit}>Cancel</button>
                )}
              </div>
            </form>
          </div>
        ) : (
          <div className="mb-16">
            <button className="btn" type="button" onClick={toggleShowForm}>
              <Plus size={16} /> Add Complexity Level
            </button>
          </div>
        )
      )}

      <div className="panel">
        <h3>Levels List</h3>
        {levels.length === 0 ? (
          <div className="text-muted">No complexity levels found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Req. Review</th>
                <th>Code Dev</th>
                <th>Peer Review</th>
                <th>Bench Test</th>
                <th>Unit Test</th>
                <th>Total Hours</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id} className={l.is_active ? '' : 'row-inactive'}>
                  <td><strong>{l.code}</strong></td>
                  <td>{l.name}</td>
                  <td className="text-muted">{l.description || '-'}</td>
                  <td>{l.requirement_review_h}</td>
                  <td>{l.code_development_h}</td>
                  <td>{l.peer_review_fixing_h}</td>
                  <td>{l.bench_testing_h}</td>
                  <td>{l.unit_testing_h}</td>
                  <td><strong>{l.total_hours}</strong></td>
                  <td>{l.is_active ? <span className="badge badge-success">Active</span> : <span className="badge">Inactive</span>}</td>
                  {isAdmin && (
                    <td>
                      <span className="icon-actions">
                        <button className="icon-btn" title="Edit" onClick={() => handleEdit(l)}>
                          <Pencil size={16} />
                        </button>
                        <button className="icon-btn icon-btn-danger" title="Deactivate" onClick={() => handleDelete(l.id)}>
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}