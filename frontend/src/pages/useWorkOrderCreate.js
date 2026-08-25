import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

const emptyForm = {
  wo_number: '',
  title: '',
  description: '',
  customer: '',
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
          title: workOrder.title,
          description: workOrder.description || '',
          customer: workOrder.customer || '',
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);

    const formattedForm = {
      wo_number: form.wo_number.trim().toUpperCase(),
      title: form.title.trim().toUpperCase(),
      description: capitalizeWords(form.description),
      customer: capitalizeWords(form.customer),
    };

    try {
      if (isEditMode) {
        await api.put(`/work-orders/${id}`, formattedForm);
        navigate(`/work-orders/${id}`);
      } else {
        const response = await api.post('/work-orders', {
          wo_number: form.wo_number.trim().toUpperCase(),
          ...formattedForm,
        });
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
    handleSubmit,
    handleCancel,
  };
}
  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setError('');
  //   setLoading(true);
  //   try {
  //     const res = await api.post('/work-orders', form);
  //     navigate(`/work-orders/${res.data.data.id}`);
  //   } catch (err) {
  //     setError(err.response?.data?.message || 'Failed to create work order');
  //   } finally {
  //     setLoading(false);
  //   }
  // };
