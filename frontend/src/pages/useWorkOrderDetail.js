import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

const emptyItemForm = { item_number: '', title: '', description: '', quantity: 1 };

export default function useWorkOrderDetail() {
  const { id } = useParams();
  const [wo, setWo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [message, setMessage] = useState('');
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(`/work-orders/${id}`);
      setWo(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleItemChange = (event) => {
    setItemForm({ ...itemForm, [event.target.name]: event.target.value });
  };
//stored in capitalized
    const capitalizeWords = (value = '') =>
    value
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());

  const openAddItem = () => {
    setEditingItemId(null);
    setItemForm(emptyItemForm);
    setShowAddItemForm(true);
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post(`/work-orders/${id}/items`, {
        ...itemForm,
        //store in capitalized and trimmed
        item_number: itemForm.item_number.trim().toUpperCase(),
        title: capitalizeWords(itemForm.title),
        description: capitalizeWords(itemForm.description),
        quantity: parseInt(itemForm.quantity, 10) || 1,
        });
      setItemForm(emptyItemForm);
      setShowAddItemForm(false);
      setMessage('Item added');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add item');
    }
  };

  const handleEditItem = (item) => {
    setShowAddItemForm(false);
    setEditingItemId(item.id);
    setItemForm({
      item_number: item.item_number,
      title: item.title,
      description: item.description || '',
      quantity: item.quantity,
    });
  };

  const handleUpdateItem = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.put(`/work-orders/items/${editingItemId}`, {
        title: itemForm.title,
        description: itemForm.description,
        quantity: parseInt(itemForm.quantity, 10) || 1,
      });
      setEditingItemId(null);
      setItemForm(emptyItemForm);
      setMessage('Item updated');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update item');
    }
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setShowAddItemForm(false);
    setItemForm(emptyItemForm);
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Delete this item?')) return;
    setError('');
    try {
      await api.delete(`/work-orders/items/${itemId}`);
      setMessage('Item deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete item');
    }
  };

  const handleAnalyze = async () => {
    setError('');
    setMessage('');
    setAnalyzing(true);
    try {
      const res = await api.post(`/work-orders/${id}/analyze`);
      setAnalysis(res.data.data);
      setMessage('Analysis complete');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm('Finalize this work order?')) return;
    setError('');
    setMessage('');
    setFinalizing(true);
    try {
      await api.post(`/work-orders/${id}/finalize`);
      setMessage('Work order finalized');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to finalize work order');
    } finally {
      setFinalizing(false);
    }
  };

  return {
    id,
    wo,
    error,
    loading,
    analyzing,
    finalizing,
    analysis,
    message,
    itemForm,
    editingItemId,
    showAddItemForm,
    handleItemChange,
    openAddItem,
    handleAddItem,
    handleEditItem,
    handleUpdateItem,
    cancelEdit,
    handleDeleteItem,
    handleAnalyze,
    handleFinalize,
  };
}
