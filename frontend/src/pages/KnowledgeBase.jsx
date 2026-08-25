import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

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

export default function KnowledgeBase() {
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
  const [saving, setSaving] = useState(false);

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

  if (loading) return <div>Loading...</div>;
  if (error && items.length === 0) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="flex justify-between align-center mb-16">
        <h1>Knowledge Base</h1>
        {isAdmin && (
          <button className="btn" onClick={openCreate}>+ Add KB Item</button>
        )}
      </div>
      <div className="text-muted mb-16">
        KB items are matched against work order items during analysis. New or edited items take effect on the next Analyze.
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="panel">
          <h3>{editingId ? 'Edit KB Item' : 'Add KB Item'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-row">
                <label>KB Code</label>
                <input name="kb_code" value={form.kb_code} onChange={handleChange} placeholder="KB-0006" required />
              </div>
              <div className="form-row">
                <label>Title</label>
                <input name="title" value={form.title} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-row">
              <label>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} />
            </div>
            <div className="form-row">
              <label>Keywords (comma separated)</label>
              <input name="keywords" value={form.keywords} onChange={handleChange} placeholder="alarm,setpoint,configuration" />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Firmware Related</label>
                <select name="fw_related" value={form.fw_related} onChange={handleChange}>
                  <option value={true}>Yes</option>
                  <option value={false}>No</option>
                </select>
              </div>
              <div className="form-row">
                <label>Complexity Level</label>
                <select name="complexity_level_id" value={form.complexity_level_id} onChange={handleChange}>
                  <option value="">None</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>{level.code} - {level.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Confidence Score</label>
                <input name="confidence_score" type="number" min="0" max="100" value={form.confidence_score} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Active</label>
                <select name="is_active" value={form.is_active} onChange={handleChange}>
                  <option value={true}>Yes</option>
                  <option value={false}>No</option>
                </select>
              </div>
            </div>
            <div className="flex gap-8">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={cancelForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Description</th>
            <th>Keywords</th>
            <th>Firmware</th>
            <th>Complexity</th>
            <th>Confidence</th>
            <th>Active</th>
            {isAdmin && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.kb_code}</strong></td>
              <td>{item.title}</td>
              <td className="text-muted">{item.description || '-'}</td>
              <td className="text-muted">{item.keywords || '-'}</td>
              <td>{item.fw_related ? 'YES' : 'NO'}</td>
              <td>{item.complexity_code || '-'}</td>
              <td>{item.confidence_score}%</td>
              <td>{item.is_active ? 'Yes' : 'No'}</td>
              {isAdmin && (
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}