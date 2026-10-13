import { useValueToast, useToast } from '../components/Toast';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import UploadPreviewModal from '../components/work-order/UploadPreviewModal';

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

    if (selectedFile.type !== 'application/pdf') {
      toast({ variant: 'destructive', description: 'Please upload a PDF file.' });
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setUploading(true);
    setConfirmError('');
    try {
      const res = await api.post('/work-orders/upload', formData);
      setPreview({ extracted: res.data.extracted, warnings: res.data.warnings || [] });
    } catch (err) {
      toast({ variant: 'destructive', description: err.response?.data?.message || 'Failed to process PDF file' });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleConfirmUpload = async (payload) => {
    setConfirming(true);
    setConfirmError('');
    try {
      const res = await api.post('/work-orders/upload/confirm', payload);
      setPreview(null);
      toast({ variant: 'success', description: `Work order ${res.data.data.wo_number} imported.` });
      await loadWorkOrders();
    } catch (err) {
      setConfirmError(err.response?.data?.message || 'Failed to import work order');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelUpload = () => setPreview(null);

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
              accept="application/pdf"
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
          error={confirmError}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
        />
      )}
    </div>
  );
}
