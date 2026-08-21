import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function WorkOrderCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ wo_number: '', title: '', description: '', customer: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/work-orders', form);
      navigate(`/work-orders/${res.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create work order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Create Work Order</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="panel" style={{ maxWidth: 600 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>WO Number</label>
            <input name="wo_number" value={form.wo_number} onChange={handleChange} placeholder="WO-2026-002" required />
          </div>
          <div className="form-row">
            <label>Title</label>
            <input name="title" value={form.title} onChange={handleChange} required />
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} />
          </div>
          <div className="form-row">
            <label>Customer</label>
            <input name="customer" value={form.customer} onChange={handleChange} />
          </div>
          <div className="flex gap-8">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/work-orders')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}