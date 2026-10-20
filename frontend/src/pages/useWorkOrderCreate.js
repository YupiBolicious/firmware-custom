import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';


const emptyForm = {
  wo_number: '',
  customer: '',
  model: '',
  serial_numbers: '',
  itemsText: '',
  revision: 0,
};

const capitalizeWords = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function useWorkOrderCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [permissionError, setPermissionError] = useState('');

  useEffect(() => {
    if (!isEditMode) return;

    const load = async () => { 
      try {
        const response = await api.get(`/work-orders/${id}`);
        const workOrder = response.data.data;
        setForm({
          wo_number: workOrder.wo_number,
          revision: workOrder.revision ?? 0,
          itemsText: (workOrder.items || [])
            .map((item) => item.title)
            .filter(Boolean)
            .join('\n'),
          customer: workOrder.customer || '',
          model: (workOrder.groups?.[0]?.machine_model_code || '').toUpperCase(),
          serial_numbers: (workOrder.groups || [])
            .map((g) => g.serial_number)
            .filter(Boolean)
            .map((s) => s.toUpperCase())
            .join(', '),
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load work order');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditMode]);

  const handleChange = (event) => {
    const value = event.target.name === 'model' || event.target.name === 'serial_numbers'
      ? event.target.value.toUpperCase()
      : event.target.value;
    setForm({ ...form, [event.target.name]: value });
  };

  const buildBody = () => {
    const serialNumbers = (form.serial_numbers || '')
      .split(',')
      .map((sn) => sn.trim().toUpperCase())
      .filter(Boolean);

    const groups = serialNumbers.map((serial_number) => ({
      machine_model_id: form.model.trim().toUpperCase(),
      serial_number,
    }));

    const itemsText = form.itemsText || '';
    const splitByNewline = itemsText.includes('\n') || itemsText.includes('\r');
    let rawItems = [];
    if (splitByNewline) {
      rawItems = itemsText
        .split(/\r?\n/)
        .map((title) => title.replace(/^\s*\d+[.)]?\s*/, '').trim())
        .map((title) => (title.startsWith('.') || title.startsWith(')') ? title.slice(1).trim() : title))
        .filter(Boolean);
    } else {
      rawItems = itemsText
        .split(',')
        .map((title) => title.replace(/^\s*\d+[.)]?\s*/, '').trim())
        .map((title) => (title.startsWith('.') || title.startsWith(')') ? title.slice(1).trim() : title))
        .filter(Boolean);
    }
    const items = rawItems.map((title) => {
      let clean = String(title).trim();
      // Use backend logic exactly: sum ALL multipliers anywhere; keep title intact
      const MULT_RE = /(?<![\w./:\-])(\d+)\s*[xX](?![\w./:\-%])/g;
      const matches = [...clean.matchAll(MULT_RE)];
      if (matches.length) {
        const total = matches.reduce((s, mm) => s + (parseInt(mm[1], 10) || 0), 0);
        if (total > 0) {
          return {
            title: capitalizeWords(clean),
            quantity: total,
          };
        }
      }
      // Generic fallback: first count not unit-followed (frontend has no next word; keep safe)
      const COUNT_RE = /(?<![\w./:\-])(\d+)(?![\w./:\-%])/g;
      for (const mm of clean.matchAll(COUNT_RE)) {
        const v = parseInt(mm[1], 10) || 0;
        if (v < 1) continue;
        if (/(AMP|AMPS|VAC|VDC|HZ|KHZ|MHZ|MM|CM|METER|FEET|INCH|LB|LBS|KG|G|PSI|BAR|RA|%)/i.test(clean.slice((mm.index || 0) + mm[0].length))) continue;
        return { title: capitalizeWords(clean), quantity: v };
      }
      return { title: capitalizeWords(clean), quantity: 1 };
    });

    return {
      wo_number: form.wo_number.trim().toUpperCase(),
      revision: Number(form.revision) >= 0 ? Number(form.revision) : 0,
      customer: form.customer?.trim() ? capitalizeWords(form.customer) : '',
      groups,
      items,
    };
  };

  const submitCreate = async (extra = {}) => {
    setError('');
    setSaving(true);
    try {
      const response = await api.post('/work-orders', { ...buildBody(), ...extra });
      navigate(`/work-orders/${response.data.data.id}`);
    } catch (err) {
      const body = err.response?.data;
      if (err.response?.status === 409 && body?.data?.code === 'WO_DUPLICATE') {
        setDuplicate(body.data);
        setError('');
        return;
      }
      if (err.response?.status === 403 && body?.data?.code === 'WO_FORBIDDEN') {
        setDuplicate(null);
        setPermissionError(body?.message || "You don't have permission to edit this work order");
        setError('');
        return;
      }
      setError(body?.message || 'Failed to create work order');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (isEditMode) {
      setSaving(true);
      try {
        await api.put(`/work-orders/${id}`, {
          wo_number: form.wo_number.trim().toUpperCase(),
          revision: Number(form.revision) >= 0 ? Number(form.revision) : 0,
          customer: form.customer?.trim() ? capitalizeWords(form.customer) : '',
        });
        navigate(`/work-orders/${id}`);
      } catch (err) {
        const body = err.response?.data;
        if (err.response?.status === 403 && body?.data?.code === 'WO_FORBIDDEN') {
          setPermissionError(body?.message || "You don't have permission to edit this work order");
          setError('');
          return;
        }
        setError(body?.message || 'Failed to update work order');
      } finally {
        setSaving(false);
      }
      return;
    }

    await submitCreate();
  };

  const handleConfirmOverwrite = async () => {
    setDuplicate(null);
    await submitCreate({ overwrite: true });
  };

  const handleCancel = () => {
    navigate(isEditMode ? `/work-orders/${id}` : '/work-orders');
  };

  const handleOpenExisting = () => {
    if (duplicate) navigate(`/work-orders/${duplicate.existing_work_order_id}`);
  };

  const handleDismissDuplicate = () => setDuplicate(null);

  const handleDismissPermission = () => setPermissionError('');

    return {
    form,
    error,
    loading,
    saving,
    isEditMode,
    duplicate,
    permissionError,
    handleChange,
    handleSubmit,
    handleCancel,
    handleOpenExisting,
    handleDismissDuplicate,
    handleConfirmOverwrite,
    handleDismissPermission,
  };
}