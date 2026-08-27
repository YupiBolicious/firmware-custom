import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import useWorkOrderDetail from './useWorkOrderDetail';

const ALLOWED_EXTENSIONS = '.pdf,.doc,.docx,.zip,.7z';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function DocumentUpload({ uploading, onUpload }) {
  const [files, setFiles] = useState(null);
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!files || files.length === 0) return;
    onUpload(files, description || undefined);
    setFiles(null);
    setDescription('');
  };

  return (
    <div style={{ marginBottom: 12, padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333' }}>
      <div className="form-row">
        <label>Select files</label>
        <input
          type="file"
          accept={ALLOWED_EXTENSIONS}
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />
      </div>
      <div className="form-row">
        <label>Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Final firmware binary, test report..."
        />
      </div>
      <button className="btn btn-sm" onClick={handleSubmit} disabled={!files || files.length === 0 || uploading}>
        {uploading ? 'Uploading...' : `Upload${files ? ` (${files.length})` : ''}`}
      </button>
    </div>
  );
}

export default function WorkOrderDetail() {
  const { hasRole } = useAuth();
  const isCoder = hasRole('CODER');
  const { wo, error, loading, analyzing, finalizing, startingProduction, uploading, analysis, message, itemForm,
    editingItemId, handleItemChange, handleEditItem, handleUpdateItem, cancelEdit,
    showAddItemForm, openAddItem, handleAddItem, handleDeleteItem, handleAnalyze, handleFinalize,
    handleStartProduction, documents, handleUploadDocuments, handleDeleteDocument } = useWorkOrderDetail();

  if (loading) return <div>Loading...</div>;
  if (error && !wo) return <div className="alert alert-error">{error}</div>;
  if (!wo) return <div className="alert alert-error">Work order not found</div>;

  const items = wo.items || [];
  const summary = analysis?.summary || null;

  return (
    <div>
      <div className="flex justify-between align-center mb-16">
        <h1>{wo.wo_number}</h1>
        <div className="flex gap-8">
          <Link className="btn btn-secondary" to={isCoder ? '/review-queue' : '/work-orders'}>
            {isCoder ? 'Back to Review Queue' : 'Back to List'}
          </Link>
          {!isCoder && wo.status !== 'FINALIZED' && wo.status !== 'PRODUCTION' && wo.status !== 'COMPLETED' && (
            <Link className="btn btn-secondary" to={`/work-orders/${wo.id}/edit`}>Edit Work Order</Link>
          )}
          {!isCoder && wo.status === 'ANALYZED' && (
            <button className="btn" onClick={handleFinalize} disabled={finalizing}>
              {finalizing ? 'Finalizing...' : 'Finalize Work Order'}
            </button>
          )}
          {isCoder && wo.status === 'FINALIZED' && (
            <button className="btn" onClick={handleStartProduction} disabled={startingProduction}>
              {startingProduction ? 'Starting...' : 'Start Production'}
            </button>
          )}
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <h3>Work Order Details</h3>
        <div className="form-grid">
          <div><span className="text-muted">Status:</span> <StatusBadge status={wo.status} /></div>
          <div><span className="text-muted">Customer:</span> {wo.customer || '-'}</div>
          <div><span className="text-muted">Machine Model:</span> {wo.machine_model_name ? `${wo.machine_model_code} - ${wo.machine_model_name}` : '-'}</div>
          <div><span className="text-muted">Version:</span> {wo.machine_model_version || '-'}</div>
          <div><span className="text-muted">Created By:</span> {wo.created_by_name || '-'}</div>
          <div><span className="text-muted">Created At:</span> {new Date(wo.created_at).toLocaleString()}</div>
        </div>
        {wo.description && <div className="mt-8 text-muted">{wo.description}</div>}
      </div>

      {/* Items */}
      <div className="panel">
        <div className="flex justify-between align-center mb-8">
          <h3>Custom Items Details</h3>
          {!isCoder && (
            <div className="item-actions">
              <button className="btn" onClick={handleAnalyze} disabled={analyzing || finalizing || items.length === 0 || wo.status !== 'DRAFT'}>
                {analyzing ? 'Analyzing...' : 'Analyze / Estimate'}
              </button>
              {(wo.status === 'DRAFT' || wo.status === 'ANALYZED') && (
                <button className="btn btn-secondary" type="button" onClick={openAddItem}>
                  {items.length === 0 ? '+ Add Custom Item' : '+ Add Another Item'}
                </button>
              )}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-muted">No custom items yet. Use the add button above to create the first item.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Title</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Firmware</th>
                <th>Complexity</th>
                <th>Confidence</th>
                <th>Hours</th>
                <th>Status</th>
                {!isCoder && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_number}</td>
                  <td>{item.title}</td>
                  <td>{item.description || '-'}</td>
                  <td>{item.quantity}</td>
                  <td>
                    {item.fw_related === true ? 'YES' : item.fw_related === false ? 'NO' : '-'}
                  </td>
                  <td>{item.complexity_code || '-'}</td>
                  <td>{item.confidence_score != null ? `${item.confidence_score}%` : '-'}</td>
                  <td>{item.estimated_hours != null ? `${item.estimated_hours}h` : 'N/A'}</td>
                  <td><StatusBadge status={item.classification_status} /></td>
                  {!isCoder && <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleEditItem(item)} disabled={wo.status !== 'DRAFT'}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item.id)} disabled={wo.status !== 'DRAFT'}>Delete</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Item */}
      {!isCoder && (editingItemId || showAddItemForm) && (
        <div className="panel">
          <h3>{editingItemId ? 'Edit Item' : 'Add Custom Item'}</h3>
          <form onSubmit={editingItemId ? handleUpdateItem : handleAddItem}>
          <div className="form-grid">
            <div className="form-row">
              <label>Item Number</label>
              {/*item number edit is disabled when existing item or if the work order is finalized*/}
                <input
                className="item-number-input"
                name="item_number"
                value={itemForm.item_number}
                onChange={handleItemChange}
                placeholder="ITEM-005"
                disabled={!!editingItemId || wo.status === 'FINALIZED'}
                required
              />
            </div>
            <div className="form-row">
              <label>Quantity</label>
              <input
                className="custom-item-text"
                name="quantity"
                type="number"
                min="1"
                value={itemForm.quantity}
                onChange={handleItemChange}
                disabled={wo.status === 'FINALIZED'}
              />
            </div>
          </div>
          <div className="form-row">
            <label>Title</label>
            <input className='custom-item-text' name="title" value={itemForm.title} onChange={handleItemChange} required disabled={wo.status === 'FINALIZED'} />
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea className="custom-item-text" name="description" value={itemForm.description} onChange={handleItemChange} disabled={wo.status === 'FINALIZED'} />
          </div>
          <div className="flex gap-8">
              <button className="btn" type="submit" disabled={wo.status === 'FINALIZED'}>{editingItemId ? 'Update Item' : 'Add Item'}</button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Estimation Preview */}
      {analysis && (
        <div className="panel">
          <h3>Estimation Preview</h3>
          <div className="stats-grid">
            <div className="stat">
              <div className="label">Total Items</div>
              <div className="value">{summary.total_items}</div>
            </div>
            <div className="stat">
              <div className="label">Firmware Items</div>
              <div className="value">{summary.firmware_items}</div>
            </div>
            <div className="stat">
              <div className="label">Non-Firmware Items</div>
              <div className="value">{summary.non_firmware_items}</div>
            </div>
            <div className="stat">
              <div className="label">Waiting for Review</div>
              <div className="value">{summary.waiting_review}</div>
            </div>
            <div className="stat">
              <div className="label">Total Estimated Hours</div>
              <div className="value">{summary.total_estimated_hours}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Title</th>
                <th>Firmware</th>
                <th>Complexity</th>
                <th>Confidence</th>
                <th>Hours</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {analysis.results.map((r) => (
                <tr key={r.item_id}>
                  <td>{r.item_number}</td>
                  <td>{r.title}</td>
                  <td>{r.fw_related === true ? 'YES' : r.fw_related === false ? 'NO' : 'Pending'}</td>
                  <td>{r.complexity_code || '-'}</td>
                  <td>{r.confidence_score != null ? `${r.confidence_score}%` : '-'}</td>
                  <td>{r.estimated_hours != null ? `${r.estimated_hours}h` : 'N/A'}</td>
                  <td>{r.quantity || '-'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-muted">{r.classification_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wo.production_tasks?.length > 0 && (
        <div className="panel">
          <h3>Production Tasks</h3>
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Item</th>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {wo.production_tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.task_code}</td>
                  <td>{task.work_order_item_id}</td>
                  <td>{task.title}</td>
                  <td>{task.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents */}
      {(wo.status === 'PRODUCTION' || wo.status === 'COMPLETED') && (
        <div className="panel">
          <h3 className="mb-16">Documentation File</h3>
          {isCoder && wo.status === 'PRODUCTION' && (
            <DocumentUpload uploading={uploading} onUpload={handleUploadDocuments} />
          )}
          {documents.length === 0 ? (
            <div className="text-muted">{wo.status === 'PRODUCTION' ? 'No documents uploaded yet.' : 'No documents.'}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Uploaded By</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.original_name}</strong></td>
                    <td>{formatBytes(doc.size_bytes)}</td>
                    <td>{doc.uploaded_by_name || '-'}</td>
                    <td className="text-muted">{new Date(doc.created_at).toLocaleString()}</td>
                    <td>
                      <a className="btn btn-secondary btn-sm" href={`/api/work-orders/${wo.id}/documents/${doc.id}/download?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer">Download</a>
                      {isCoder && wo.status === 'PRODUCTION' && (
                        <>{' '}<button className="btn btn-danger btn-sm" onClick={() => handleDeleteDocument(doc.id)}>Delete</button></>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}