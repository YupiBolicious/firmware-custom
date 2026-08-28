import { ChevronUp, KeyRound, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import useUserManagement from './useUserManagement';

const ROLE_OPTIONS = [
  { code: 'PM', label: 'Project Manager' },
  { code: 'CODER', label: 'Coder' },
  { code: 'ADMIN', label: 'Administrator' },
];

export default function UserManagement() {
  const {
    users,
    loading,
    error,
    form,
    editingId,
    showForm,
    busyId,
    setForm,
    toggleShowForm,
    handleSave,
    handleEdit,
    handleCancelEdit,
    handleToggleActive,
    handleResetPassword,
  } = useUserManagement();

  const toggleRole = (code) => {
    setForm({
      ...form,
      roles: form.roles.includes(code)
        ? form.roles.filter((r) => r !== code)
        : [...form.roles, code],
    });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>User Management</h1>
      {/* <div className="text-muted mb-16">
        Manually registered users. Passwords are stored hashed; default passwords should be changed after first use.
      </div> */}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm ? (
        <div className="panel mb-16">
          <div className="flex justify-between align-center mb-16">
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit User' : 'Add User'}</h3>
            <button className="icon-btn" title="Collapse" onClick={toggleShowForm}>
              <ChevronUp size={16} />
            </button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-row">
                <label>Username</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. user1@pm (lowercase)" required />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editingId} required />
              </div>
            </div>
            <div className="form-row">
              <label>Full Name</label>
              <input className="wo-input-text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label>Roles</label>
              <div className="flex gap-8">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role.code} className="checkbox-inline">
                    <input type="checkbox" checked={form.roles.includes(role.code)} onChange={() => toggleRole(role.code)} />
                    {role.code}
                  </label>
                ))}
              </div>
            </div>
            {!editingId && (
              <div className="form-row">
                <label>Default Password</label>
                <input type="password" value={form.default_password} onChange={(e) => setForm({ ...form, default_password: e.target.value })} placeholder="At least 8 characters" minLength={8} required />
              </div>
            )}
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
            <Plus size={16} /> Add User
          </button>
        </div>
      )}

      <div className="panel">
        <h3>Users List</h3>
        {users.length === 0 ? (
          <div className="text-muted">No users found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Full Name</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'row-inactive'}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{u.full_name}</td>
                  <td>
                    {u.roles.map((role) => (
                      <span key={role} className="badge badge-info" style={{ marginRight: 4 }}>{role}</span>
                    ))}
                  </td>
                  <td>{u.is_active ? <span className="badge badge-success">Active</span> : <span className="badge">Inactive</span>}</td>
                  <td className="text-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
                  <td>
                    <span className="icon-actions">
                      <button className="icon-btn" title="Edit" onClick={() => handleEdit(u)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn" title="Reset password" onClick={() => handleResetPassword(u)}>
                        <KeyRound size={16} />
                      </button>
                      {u.is_active ? (
                        <button className="icon-btn icon-btn-danger" title="Deactivate" disabled={busyId === u.id} onClick={() => handleToggleActive(u)}>
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <button className="icon-btn" title="Reactivate" disabled={busyId === u.id} onClick={() => handleToggleActive(u)}>
                          <UserCheck size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}