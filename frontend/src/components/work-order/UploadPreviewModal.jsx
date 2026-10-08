import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const emptyItem = { title: '', quantity: 1 };

export default function UploadPreviewModal({ extracted, warnings, confirming, error, onConfirm, onCancel }) {
  const [form, setForm] = useState(() => ({
    wo_number: (extracted.wo_number || '').trim(),
    customer: (extracted.customer || '').trim(),
    model_code: (extracted.model_code || '').trim(),
    serial_numbers: (extracted.serial_numbers || []).join(', '),
    items: (extracted.customize_with || [])
      .map((item) => ({ title: item.title || '', quantity: Number(item.quantity) || 1 })),
  }));

  const updateItem = (index, patch) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  const removeItem = (index) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));

  const handleConfirm = () => {
    onConfirm({
      wo_number: form.wo_number.trim(),
      customer: form.customer.trim(),
      model_code: form.model_code.trim(),
      serial_numbers: form.serial_numbers.split(',').map((s) => s.trim()).filter(Boolean),
      customize_with: form.items
        .filter((item) => item.title.trim())
        .map((item) => ({
          title: item.title.trim(),
          quantity: parseInt(item.quantity, 10) || 1,
        })),
    });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="panel" style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex justify-between align-center mb-16">
          <h2 style={{ margin: 0 }}>Review Imported Work Order</h2>
        </div>

        {warnings.length > 0 && (
          <div className="alert" style={{ marginBottom: 16 }}>
            Missing from PDF (not imported): {warnings.join(', ')} — edit below before confirming.
          </div>
        )}

        <div className="form-row">
          <label>WO Number</label>
          <input
            className="wo-number-input"
            name="wo_number"
            value={form.wo_number}
            onChange={(e) => setForm({ ...form, wo_number: e.target.value })}
            required
          />
        </div>

        <div className="form-row">
          <label>Customer</label>
          <input
            className="wo-input-text"
            name="customer"
            value={form.customer}
            onChange={(e) => setForm({ ...form, customer: e.target.value })}
          />
        </div>

        <div className="form-row">
          <label>Model Code</label>
          <input
            className="wo-input-text sn-input"
            name="model_code"
            value={form.model_code}
            onChange={(e) => setForm({ ...form, model_code: e.target.value })}
            placeholder="e.g. FWX-100"
          />
        </div>

        <div className="form-row">
          <label>Serial Number(s)</label>
          <input
            className="wo-input-text sn-input"
            name="serial_numbers"
            value={form.serial_numbers}
            onChange={(e) => setForm({ ...form, serial_numbers: e.target.value })}
            placeholder="e.g. SN001, SN002, SN003"
          />
          <small className="form-help" style={{color: '#6b7280', opacity: 0.7, fontWeight: 500}}>Enter multiple serial numbers separated by commas.</small>
        </div>

        <div className="form-row">
          <label>Customization Items</label>
          {form.items.length === 0 && (
            <div className="text-muted" style={{ marginBottom: 8 }}>No items extracted from the PDF.</div>
          )}
          {form.items.map((item, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                className="wo-input-text"
                name="item-title"
                value={item.title}
                onChange={(e) => updateItem(index, { title: e.target.value })}
                placeholder="Custom item title"
                style={{ flex: 1 }}
              />
              <input
                className="wo-input-text"
                type="number"
                min="1"
                name="item-quantity"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: e.target.value })}
                style={{ width: 80 }}
                title="Quantity"
              />
              <button className="icon-btn icon-btn-danger" type="button" onClick={() => removeItem(index)} title="Remove item" aria-label="Remove item">
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
          ))}
          
        </div>

        {error && <div className="alert" style={{ marginBottom: 16 }}>{error}</div>}
        <div className='flex justify-between items-center'>
          <div className="flex gap-8">
            <button className="btn" type="button" onClick={handleConfirm} disabled={confirming || !form.wo_number.trim()}>
              {confirming ? 'Importing...' : 'Confirm'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={addItem}>
              <Plus size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Add Item
          </button>
        </div>
      </div>
    </div>
  );
}