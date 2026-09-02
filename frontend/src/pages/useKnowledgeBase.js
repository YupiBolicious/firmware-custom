import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 10;

const emptyForm = {
  kb_code: '',
  title: '',
  description: '',
  keywords: '',
  fw_related: true,
  complexity_level_id: '',
  confidence_score: 95,
  is_active: true,
};

export default function useKnowledgeBase() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [items, setItems] = useState([]);
  const [levels, setLevels] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testItemId, setTestItemId] = useState(null);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fwFilter, setFwFilter] = useState('ALL');
  const [cxFilter, setCxFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const load = async () => {
    try {
      const [kbRes, levelsRes] = await Promise.all([
        api.get('/kb'),
        api.get('/complexity-levels'),
      ]);
      setItems(kbRes.data.data);
      setLevels(levelsRes.data.data.filter((level) => /^L[0-5]$/.test(level.code)));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      kb_code: item.kb_code,
      title: item.title,
      description: item.description || '',
      keywords: item.keywords || '',
      fw_related: item.fw_related,
      complexity_level_id: item.complexity_level_id || '',
      confidence_score: Number(item.confidence_score),
      is_active: item.is_active,
    });
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    const payload = {
      ...form,
      fw_related: form.fw_related === true || form.fw_related === 'true',
      complexity_level_id: form.complexity_level_id ? Number(form.complexity_level_id) : null,
      confidence_score: Number(form.confidence_score) || 95,
      is_active: form.is_active === true || form.is_active === 'true',
    };
    try {
      if (editingId) {
        await api.put(`/kb/${editingId}`, payload);
        setMessage('Knowledge base item updated');
      } else {
        await api.post('/kb', payload);
        setMessage('Knowledge base item created');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save knowledge base item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete KB item ${item.kb_code}?`)) return;
    setError('');
    setMessage('');
    try {
      await api.delete(`/kb/${item.id}`);
      setMessage('Knowledge base item deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete knowledge base item');
    }
  };

  const openTest = (item) => {
    setTestItemId(item.id);
    setTestText('');
    setTestResult(null);
  };

  const closeTest = () => {
    setTestItemId(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTestLoading(true);
    try {
      const res = await api.post(`/kb/${testItemId}/test`, { sample_text: testText });
      setTestResult(res.data.data);
    } catch (err) {
      setTestResult({ error: err.response?.data?.message || 'Test failed' });
    } finally {
      setTestLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (fwFilter !== 'ALL' && String(!!item.fw_related) !== fwFilter) return false;
      if (cxFilter !== 'ALL' && Number(item.complexity_level_id) !== Number(cxFilter)) return false;
      if (!q) return true;
      return ['kb_code', 'title', 'description', 'keywords']
        .some((field) => String(item[field] || '').toLowerCase().includes(q));
    });
  }, [items, search, fwFilter, cxFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return {
    isAdmin,
    items,
    levels,
    error,
    message,
    loading,
    form,
    editingId,
    showForm,
    expandedId,
    setExpandedId,
    saving,
    testItemId,
    testText,
    setTestText,
    testResult,
    testLoading,
    search,
    setSearch,
    fwFilter,
    setFwFilter,
    cxFilter,
    setCxFilter,
    filteredItems,
    paginatedItems,
    currentPage,
    totalPages,
    page,
    setPage,
    resetPage,
    handleChange,
    openCreate,
    openEdit,
    cancelForm,
    handleSubmit,
    handleDelete,
    openTest,
    closeTest,
    handleTest,
  };
}