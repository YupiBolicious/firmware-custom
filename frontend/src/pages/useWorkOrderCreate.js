import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';


const emptyForm = {
  wo_number: '',
  customer: '',
  model: '',
  serial_numbers: '',
  itemsText: '',
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
 
  const handleSubmit = async (event) => {
  event.preventDefault();
  setError('');
  setSaving(true);

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
    

    const formattedForm = {
      wo_number: form.wo_number.trim().toUpperCase(),
      customer: form.customer?.trim()
        ? capitalizeWords(form.customer)
        : '',
    };

    try {
      if (isEditMode) {
        await api.put(`/work-orders/${id}`, formattedForm);
        navigate(`/work-orders/${id}`);
      } else {
        const response = await api.post('/work-orders', {
          ...formattedForm,
          groups,
          items,
        });

        navigate(`/work-orders/${response.data.data.id}`);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        `Failed to ${isEditMode ? 'update' : 'create'} work order`
      );
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