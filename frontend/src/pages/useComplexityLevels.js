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

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/complexity-levels/${editingId}`, form);
      } else {
        await api.post('/complexity-levels', form);
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save complexity level');
    }
  }, [editingId, form, load]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Deactivate this complexity level?')) return;
    setError('');
    try {
      await api.delete(`/complexity-levels/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate complexity level');
    }
  }, [load]);

  const handleEdit = useCallback((level) => {
    setEditingId(level.id);
    setShowForm(true);
    setForm({
      code: level.code,
      name: level.name,
      description: level.description || '',
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
    handleDelete,
    handleEdit,
    handleCancelEdit,
  };
}