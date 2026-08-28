import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Pencil, Trash2, FlaskConical, X, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

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

  if (loading) return <div>Loading...</div>;
  if (error && items.length === 0) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="flex justify-between align-center mb-16">
        <h1>Knowledge Base</h1>
        {isAdmin && (
          <button className="btn" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Add KB Item
          </button>
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

      <div className="panel mb-16 kb-filter-bar">
        <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-row" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
            <label>Search</label>
            <input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Search code, title, description, keywords..."
            />
          </div>
          <div className="form-row" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            <label>Firmware Related</label>
            <select value={fwFilter} onChange={(e) => resetPage(setFwFilter)(e.target.value)}>
              <option value="ALL">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div className="form-row" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            <label>Complexity Level</label>
            <select value={cxFilter} onChange={(e) => resetPage(setCxFilter)(e.target.value)}>
              <option value="ALL">All</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>{level.code} - {level.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Firmware</th>
            <th>Complexity</th>
            {isAdmin && <th className="col-actions">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => (
            <Fragment key={item.id}>
              <tr>
                <td><strong>{item.kb_code}</strong></td>
                <td>{item.title}</td>
                <td>{item.fw_related ? 'YES' : 'NO'}</td>
                <td>{item.complexity_code || '-'}</td>
                {isAdmin && (
                  <td className="col-actions">
                    <span className="icon-actions">
                      <button className="icon-btn" title={expandedId === item.id ? 'Hide details' : 'View details'} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                        {expandedId === item.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(item)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDelete(item)}>
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </td>
                )}
              </tr>
              {expandedId === item.id && (
                <tr className="kb-detail-row">
                  <td colSpan={isAdmin ? 5 : 4}>
                    <div className="kb-detail-grid">
                      <div>
                        <div className="kb-detail-label">Description</div>
                        <div className="text-muted">{item.description || '-'}</div>
                      </div>
                      <div>
                        <div className="kb-detail-label">Keywords</div>
                        <div className="text-muted">{item.keywords || '-'}</div>
                      </div>
                      <div>
                        <div className="kb-detail-label">Confidence</div>
                        <div>{item.confidence_score}%</div>
                      </div>
                      <div>
                        <div className="kb-detail-label">Active</div>
                        <div>{item.is_active ? 'Yes' : 'No'}</div>
                      </div>
                      <div>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openTest(item)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <FlaskConical size={14} /> Test
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {filteredItems.length === 0 ? (
        <div className="text-muted mt-8">
          {search || fwFilter !== 'ALL' || cxFilter !== 'ALL'
            ? 'No KB items match the current filters.'
            : 'No KB items found.'}
        </div>
      ) : (
        <div className="flex justify-between align-center mt-16">
          <span className="text-muted" style={{ fontSize: 13 }}>
            {filteredItems.length} item{(filteredItems.length !== 1) ? 's' : ''} · Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Prev
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {testItemId && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Test KB Item</h3>
          <div className="form-row">
            <label>Sample work order text</label>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Paste a title or description to test against this KB item..."
              rows={3}
            />
          </div>
          <div className="flex gap-8">
            <button className="btn" onClick={handleTest} disabled={testLoading || !testText.trim()}>
              {testLoading ? 'Testing...' : 'Run Test'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setTestItemId(null); setTestResult(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <X size={14} /> Close
            </button>
          </div>
          {testResult && !testResult.error && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Verdict:</strong>{' '}
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 600,
                  backgroundColor: testResult.verdict === 'EXACT_MATCH' ? '#166534'
                    : testResult.verdict === 'SIMILARITY' ? '#854d0e'
                    : testResult.verdict === 'NON_FIRMWARE' ? '#6b21a8' : '#555',
                  color: '#fff',
                }}>
                  {testResult.verdict.replace('_', ' ')}
                </span>
                <span style={{ marginLeft: 12, color: '#aaa' }}>
                  {(testResult.score * 100).toFixed(0)}% similarity
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 4 }}>
                Matched tokens: {testResult.intersection.length > 0 ? testResult.intersection.join(', ') : '(none)'}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                KB tokens ({testResult.kb_tokens.length}): {testResult.kb_tokens.join(', ')}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                Input tokens ({testResult.item_tokens.length}): {testResult.item_tokens.join(', ')}
              </div>
            </div>
          )}
          {testResult?.error && <div className="alert alert-error" style={{ marginTop: 8 }}>{testResult.error}</div>}
        </div>
      )}
    </div>
  );
}