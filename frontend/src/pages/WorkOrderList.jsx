import { useValueToast, useToast } from '../components/Toast';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import UploadPreviewModal from '../components/work-order/UploadPreviewModal';
import ConfirmModal from '../components/ConfirmModal';

const STATUS_OPTIONS = ['DRAFT', 'ANALYZED', 'FINALIZED', 'PRODUCTION', 'COMPLETED'];

export default function WorkOrderList() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [workOrders, setWorkOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  useValueToast(error);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [uploadDuplicate, setUploadDuplicate] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [permissionError, setPermissionError] = useState('');

  const loadWorkOrders = useCallback(async () => {
    try {
      const res = await api.get('/work-orders', { params: { page, search, status } });
      setWorkOrders(res.data.data.items);
      setTotal(res.data.data.total);
      setPageSize(res.data.data.limit);
      setTotalPages(res.data.data.totalPages);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-muted">Work order list unavailable.</div>;

  const itemCount = workOrders.length;
  const from = itemCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = itemCount > 0 ? Math.min(page * pageSize, total) : 0;
  const hasFilters = search !== '' || status !== 'ALL';

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.pdf') && !fileName.endsWith('.docx')) {
      toast({ variant: 'destructive', description: 'Please upload a PDF or DOCX file.' });
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setUploading(true);
    setConfirmError('');
    setUploadDuplicate(null);
    setPendingUpload(null);
    setPermissionError('');
    try {
      const res = await api.post('/work-orders/upload', formData);
      setPreview({
        extracted: res.data.extracted,
        warnings: res.data.warnings || [],
      });
    } catch (err) {
      toast({ variant: 'destructive', description: err.response?.data?.message || 'Failed to process PDF file' });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const submitUpload = async (payload, overwrite = false) => {
    setConfirming(true);
    setConfirmError('');
    try {
      const res = await api.post('/work-orders/upload/confirm', {
        ...payload,
        ...(overwrite ? { overwrite: true } : {}),
      });
      setPreview(null);
      setUploadDuplicate(null);
      setPendingUpload(null);
      setPermissionError('');
      toast({ variant: 'success', description: res.data.message || `Work order ${res.data.data.wo_number} imported.` });
      await loadWorkOrders();
    } catch (err) {
      const body = err.response?.data;
      if (err.response?.status === 409 && body?.data?.code === 'WO_DUPLICATE') {
        setPendingUpload(payload);
        setUploadDuplicate(body.data);
        return;
      }
      if (err.response?.status === 403 && body?.data?.code === 'WO_FORBIDDEN') {
        setUploadDuplicate(null);
        setPermissionError(body.message || "You don't have permission to edit this work order");
        return;
      }
      if (overwrite || body?.data?.code === 'WO_REVISION_NOT_NEWER') setUploadDuplicate(null);
      setConfirmError(body?.message || 'Failed to import work order');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmUpload = (payload) => submitUpload(payload);

  const handleConfirmOverwrite = () => {
    if (pendingUpload) submitUpload(pendingUpload, true);
  };

  const handleDismissDuplicate = () => {
    setUploadDuplicate(null);
    setPendingUpload(null);
  };

  const handleDismissPermission = () => setPermissionError('');

  const handleCancelUpload = () => {
    setPreview(null);
    setUploadDuplicate(null);
    setPendingUpload(null);
    setPermissionError('');
    setConfirmError('');
  };

  return (
    <div className="glass-page">
      <div className="page-head mb-16">
        <div>
          <h1>
            Work Orders
            <span className="wo-count-pill">{total} entries</span>
          </h1>
        </div>
        {hasRole('PM') && (
          <div className='wo-btn-group'>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
            />
            <Link className="btn" to="/work-orders/new">Create</Link>
            <button type="button" className="btn" onClick={handleUploadClick} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
          </div>
        )}
      </div>
      <div className="toolbar mb-16">
        <input
          className="filter-input"
          type="search"
          placeholder="Search WO number, model, customer, creator..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className="filter-input" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="ALL">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {workOrders.length === 0 ? (
        <div className="panel text-muted">{hasFilters ? 'No work orders match the filters.' : 'No work orders yet.'}</div>
      ) : (
        <>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WO Number</th>
                <th>Model</th>
                <th>Customer</th>
                <th className="text-center">Status</th>
                <th className="text-center">Items</th>
                <th className="text-right">Total Est. Hours</th>
                <th>Created By</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id}>
                  <td><Link to={`/work-orders/${wo.id}`}>{wo.wo_number}</Link></td>
                  <td>{wo.group_summary || '-'}</td>
                  <td>{wo.customer || '-'}</td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td className="num text-center">{wo.item_count}</td>
                  <td className="text-right">{Number(wo.total_estimated_hours).toFixed(2)} h</td>
                  <td>{wo.created_by_name || '-'}</td>
                  <td>{new Date(wo.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wo-table-footer">
          <span>
            Showing <strong>{from}-{to}</strong> of <strong>{total}</strong> work orders
          </span>
          <div className="wo-page-nav">
            <button className="wo-page-btn" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
            <button className="wo-page-btn" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
        </>
      )}
      {preview && (
        <UploadPreviewModal
          extracted={preview.extracted}
          warnings={preview.warnings}
          confirming={confirming}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmError}
        title="Upload failed"
        message={confirmError}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setConfirmError('')}
        onClose={() => setConfirmError('')}
      />
      <ConfirmModal
        isOpen={!!uploadDuplicate}
        title="Work order already exists"
        message={`Work order ${uploadDuplicate?.existing_wo_number || pendingUpload?.wo_number || ''} is at revision ${uploadDuplicate?.existing_revision ?? '?'}; uploaded revision is ${pendingUpload?.revision ?? 'not detected'}. Only a newer revision can overwrite it, and overwriting resets status to DRAFT.`}
        confirmLabel="Overwrite and reset"
        confirmVariant="danger"
        cancelLabel="Keep existing"
        loading={confirming}
        onConfirm={handleConfirmOverwrite}
        onClose={handleDismissDuplicate}
      />
      <ConfirmModal
        isOpen={!!permissionError}
        title="Can’t edit this work order"
        message={permissionError}
        confirmLabel="OK"
        hideCancel
        onConfirm={handleDismissPermission}
        onClose={handleDismissPermission}
      />
    </div>
  );
}
