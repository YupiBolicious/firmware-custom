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
            .join(', '),
          customer: workOrder.customer || '',
          model: workOrder.groups?.[0]?.machine_model_code || '',
          serial_numbers: (workOrder.groups || [])
            .map((g) => g.serial_number)
            .filter(Boolean)
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
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const buildBody = () => {
    const serialNumbers = (form.serial_numbers || '')
      .split(',')
      .map((sn) => sn.trim())
      .filter(Boolean);

    const groups = serialNumbers.map((serial_number) => ({
      machine_model_id: form.model.trim(),
      serial_number,
    }));

    const items = (form.itemsText || '')
      .split(',')
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title) => ({
        title: capitalizeWords(title),
        quantity: 1,
      }));

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