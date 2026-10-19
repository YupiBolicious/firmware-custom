import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

export const RESET_PASSWORD = 'CustomRequest123';

const emptyForm = {
  username: '',
  email: '',
  full_name: '',
  roles: [],
  default_password: '',
};

export default function useUserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetDone, setResetDone] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeAdmins, setActiveAdmins] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('ALL');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/users', { params: { page } });
      setUsers(res.data.data.items || []);
      setTotalPages(res.data.data.totalPages);
      setActiveAdmins(res.data.data.activeAdmins ?? null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const filteredUsers = users.filter((u) => {
    if (role !== 'ALL' && !u.roles.includes(role)) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(u.username).toLowerCase().includes(q) ||
      String(u.email).toLowerCase().includes(q) ||
      String(u.full_name).toLowerCase().includes(q) ||
      u.roles.some((r) => r.toLowerCase().includes(q))
    );
  });

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, {
          email: form.email,
          full_name: form.full_name,
          roles: form.roles,
        });
      } else {
        await api.post('/users', form);
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(
        Array.isArray(errors) && errors.length
          ? errors.join('; ')
          : err.response?.data?.message || 'Failed to save user'
      );
    }
  }, [editingId, form, load]);

  const handleEdit = useCallback((user) => {
    setEditingId(user.id);
    setShowForm(true);
    setForm({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      roles: user.roles,
      default_password: '',
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  }, []);

  const openToggleConfirm = useCallback((user) => {
    setToggleTarget(user);
  }, []);

  const closeToggleConfirm = useCallback(() => {
    if (busyId) return;
    setToggleTarget(null);
  }, [busyId]);

  const confirmToggleActive = useCallback(async () => {
    if (!toggleTarget) return;
    const action = toggleTarget.is_active ? 'deactivate' : 'reactivate';
    setError('');
    setBusyId(toggleTarget.id);
    try {
      await api.put(`/users/${toggleTarget.id}`, { is_active: !toggleTarget.is_active });
      await load();
      setToggleTarget(null);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} user`);
    } finally {
      setBusyId(null);
    }
  }, [toggleTarget, load]);

  const openResetConfirm = useCallback((user) => {
    setResetTarget(user);
    setResetDone(false);
  }, []);

  const closeResetConfirm = useCallback(() => {
    if (busyId) return;
    setResetTarget(null);
    setResetDone(false);
  }, [busyId]);

  const confirmResetPassword = useCallback(async () => {
    if (!resetTarget) return;
    if (resetDone) {
      setResetTarget(null);
      setResetDone(false);
      return;
    }
    setError('');
    setBusyId(resetTarget.id);
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { new_password: RESET_PASSWORD });
      setResetDone(true);
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(
        Array.isArray(errors) && errors.length
          ? errors.join('; ')
          : err.response?.data?.message || 'Failed to reset password'
      );
    } finally {
      setBusyId(null);
    }
  }, [resetTarget, resetDone]);

  return {
    users,
    activeAdmins,
    filteredUsers,
    loading,
    error,
    form,
    editingId,
    showForm,
    busyId,
    page,
    setPage,
    totalPages,
    search,
    setSearch: (v) => { setPage(1); setSearch(v); },
    role,
    setRole: (v) => { setPage(1); setRole(v); },
    setForm,
    toggleShowForm: () => setShowForm((v) => !v),
    handleSave,
    handleEdit,
    handleCancelEdit,
    toggleTarget,
    openToggleConfirm,
    closeToggleConfirm,
    confirmToggleActive,
    resetTarget,
    resetDone,
    openResetConfirm,
    closeResetConfirm,
    confirmResetPassword,
  };
}
