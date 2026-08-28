import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

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

  const load = useCallback(async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, {
          username: form.username,
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

  const handleToggleActive = useCallback(async (user) => {
    const action = user.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${user.email}?`)) return;
    setError('');
    setBusyId(user.id);
    try {
      await api.put(`/users/${user.id}`, { is_active: !user.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} user`);
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const handleResetPassword = useCallback(async (user) => {
    const newPassword = window.prompt(`New password for ${user.email} (at least 8 characters):`);
    if (!newPassword) return;
    setError('');
    setBusyId(user.id);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password });
      setForm(emptyForm);
      setEditingId(null);
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
  }, []);

  return {
    users,
    loading,
    error,
    form,
    editingId,
    showForm,
    busyId,
    setForm,
    toggleShowForm: () => setShowForm((v) => !v),
    handleSave,
    handleEdit,
    handleCancelEdit,
    handleToggleActive,
    handleResetPassword,
  };
}