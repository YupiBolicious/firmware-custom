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
  const [startingProduction, setStartingProduction] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [message, setMessage] = useState('');
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);

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

  const loadDocuments = async () => {
    try {
      const res = await api.get(`/work-orders/${id}/documents`);
      setDocuments(res.data.data);
    } catch (err) {
      // silent — documents are optional
    }
  };

  useEffect(() => {
    load();
    loadDocuments();
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

  const handleStartProduction = async () => {
    if (!window.confirm('Move this work order to production?')) return;
    setError('');
    setMessage('');
    setStartingProduction(true);
    try {
      await api.post(`/work-orders/${id}/production`);
      setMessage('Work order moved to production');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start production');
    } finally {
      setStartingProduction(false);
    }
  };

  const handleUploadDocuments = async (files, description) => {
    if (!files || files.length === 0) return;
    setError('');
    setMessage('');
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (description) formData.append('description', description);
      await api.post(`/work-orders/${id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(`${files.length} document(s) uploaded`);
      await Promise.all([load(), loadDocuments()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    setError('');
    try {
      await api.delete(`/work-orders/${id}/documents/${docId}`);
      setMessage('Document deleted');
      await loadDocuments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete document');
    }
  };

  return {
    id,
    wo,
    error,
    loading,
    analyzing,
    finalizing,
    startingProduction,
    uploading,
    analysis,
    message,
    itemForm,
    editingItemId,
    showAddItemForm,
    documents,
    handleItemChange,
    openAddItem,
    handleAddItem,
    handleEditItem,
    handleUpdateItem,
    cancelEdit,
    handleDeleteItem,
    handleAnalyze,
    handleFinalize,
    handleStartProduction,
    handleUploadDocuments,
    handleDeleteDocument,
  };
}
