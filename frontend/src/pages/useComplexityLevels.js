import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const emptyForm = {
  code: '',
  name: '',
  description: '',
  requirement_review_h: '',
  code_development_h: '',
  peer_review_fixing_h: '',
  bench_testing_h: '',
  unit_testing_h: '',
};

export default function useComplexityLevels() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/complexity-levels');
      setLevels(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load complexity levels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback((e) => {
    e.preventDefault();
    setError('');
    setSaveConfirm(true);
  }, []);

  const closeSaveConfirm = useCallback(() => {
    if (saving) return;
    setSaveConfirm(false);
  }, [saving]);

  const confirmSave = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/complexity-levels/${editingId}`, form);
      } else {
        await api.post('/complexity-levels', form);
      }
      setForm(emptyForm);
      setEditingId(null);
      setSaveConfirm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save complexity level');
    } finally {
      setSaving(false);
    }
  }, [editingId, form, load]);

  const openDeleteConfirm = useCallback((level) => {
    setDeleteTarget(level);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setError('');
    setDeleting(true);
    try {
      await api.delete(`/complexity-levels/${deleteTarget.id}`);
      await load();
      setDeleteTarget(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate complexity level');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const handleEdit = useCallback((level) => {
    setEditingId(level.id);
    setShowForm(true);
    setForm({
      code: level.code,
      name: level.name,
      description:level.description || '',
      requirement_review_h: level.requirement_review_h,
      code_development_h: level.code_development_h,
      peer_review_fixing_h: level.peer_review_fixing_h,
      bench_testing_h: level.bench_testing_h,
      unit_testing_h: level.unit_testing_h,
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  }, []);

  return {
    levels,
    loading,
    error,
    form,
    editingId,
    showForm,
    setForm,
    toggleShowForm: () => setShowForm((v) => !v),
    handleSave,
    closeSaveConfirm,
    confirmSave,
    saveConfirm,
    saving,
    openDeleteConfirm,
    closeDeleteConfirm,
    confirmDelete,
    deleteTarget,
    deleting,
    handleEdit,
    handleCancelEdit,
  };
}