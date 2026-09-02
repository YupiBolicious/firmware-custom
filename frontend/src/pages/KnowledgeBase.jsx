import { Fragment } from 'react';
import { Pencil, Trash2, FlaskConical, X, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import useKnowledgeBase from './useKnowledgeBase';

export default function KnowledgeBase() {
  const {
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
  } = useKnowledgeBase();

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
            <button className="btn btn-secondary" onClick={closeTest} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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