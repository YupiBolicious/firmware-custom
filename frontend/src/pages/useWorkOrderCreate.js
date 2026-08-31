import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

const emptyGroup = { machine_model_id: '', machine_model_version_id: '', serial_number: '' };

const emptyForm = {
  wo_number: '',
  title: '',
  description: '',
  customer: '',
  groups: [{ ...emptyGroup }],
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

  useEffect(() => {
    if (!isEditMode) return;

    const load = async () => {
      try {
        const response = await api.get(`/work-orders/${id}`);
        const workOrder = response.data.data;
        setForm({
          wo_number: workOrder.wo_number,
          title: workOrder.title || '',
          description: workOrder.description || '',
          customer: workOrder.customer || '',
          groups: (workOrder.groups || []).map((g) => ({
            machine_model_id: g.machine_model_code || '',
            machine_model_version_id: g.machine_model_version || '',
            serial_number: g.serial_number || '',
          })),
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

  const handleGroupFieldChange = (index, field, value) => {
    setForm((prev) => {
      const groups = prev.groups.map((g, i) => (i === index ? { ...g, [field]: value } : g));
      return { ...prev, groups };
    });
  };

  const addGroup = () => {
    setForm((prev) => ({ ...prev, groups: [...prev.groups, { ...emptyGroup }] }));
  };

  const removeGroup = (index) => {
    setForm((prev) => ({ ...prev, groups: prev.groups.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);

    const formattedGroups = form.groups.map((g) => ({
      machine_model_id: g.machine_model_id.trim(),
      machine_model_version_id: g.machine_model_version_id.trim(),
      serial_number: g.serial_number && g.serial_number.trim() ? g.serial_number.trim() : undefined,
    }));

    const formattedForm = {
      wo_number: form.wo_number.trim().toUpperCase(),
      title: form.title && form.title.trim() ? capitalizeWords(form.title) : undefined,
      description: capitalizeWords(form.description),
      customer: form.customer && form.customer.trim() ? capitalizeWords(form.customer) : '',
    };

    try {
      if (isEditMode) {
        await api.put(`/work-orders/${id}`, formattedForm);
        navigate(`/work-orders/${id}`);
      } else {
        const response = await api.post('/work-orders', { ...formattedForm, groups: formattedGroups });
        navigate(`/work-orders/${response.data.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${isEditMode ? 'update' : 'create'} work order`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate(isEditMode ? `/work-orders/${id}` : '/work-orders');
  };

  return {
    form,
    error,
    loading,
    saving,
    isEditMode,
    handleChange,
    handleGroupFieldChange,
    addGroup,
    removeGroup,
    handleSubmit,
    handleCancel,
  };
}