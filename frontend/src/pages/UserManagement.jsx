import { useValueToast } from '../components/Toast';
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
    filteredUsers,
    loading,
    error,
    message,
    form,
    editingId,
    showForm,
    busyId,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    role,
    setRole,
    setForm,
    toggleShowForm,
    handleSave,
    handleEdit,
    handleCancelEdit,
    handleToggleActive,
    handleResetPassword,
  } = useUserManagement();
  useValueToast(error);
  useValueToast(message, 'success');

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
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. user1@pm (lowercase)" disabled={!!editingId} required />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
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
        <div className="mb-16 flex justify-end">
          <button className="btn" type="button" onClick={toggleShowForm}>
            <Plus size={16} /> Add User
          </button>
        </div>
      )}

      <div className="panel table-scroll">
        <h3>Users List</h3>
        <div className="toolbar mb-8">
          <input
            className="filter-input"
            type="search"
            placeholder="Search name, email, username, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="filter-input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ALL">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.code}</option>
            ))}
          </select>
        </div>
        {(users.length === 0 || filteredUsers.length === 0) ? (
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
              {filteredUsers.map((u) => (
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
                      <button className="icon-btn" title="Reset password" disabled={busyId === u.id} onClick={() => handleResetPassword(u)}>
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
        {totalPages > 1 && (
          <div className="flex justify-between align-center" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-8">
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>Prev</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
