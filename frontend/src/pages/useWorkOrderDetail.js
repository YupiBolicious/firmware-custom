import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import useWOAccess from '../hooks/work-order/useWOAccess';
import useWOAnalysis from '../hooks/work-order/useWOAnalysis';
import useWOModelSerial from '../hooks/work-order/useWOModelSerial';
import useWOProductionNotes from '../hooks/work-order/useWOProductionNotes';

const emptyItemForm = { title: '', quantity: 1, documentation_readiness: '' };

export default function useWorkOrderDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const [wo, setWo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  const [finalizing, setFinalizing] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/${id}`);
      setWo(res.data.data);
      setNotes(res.data.data.notes || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const { analyzing, analysis, setAnalysis, handleAnalyze } = useWOAnalysis(id, load, setMessage, setError);
  const { access, accessBusy, users, handleGrantAccess, handleRevokeAccess } = useWOAccess(id, setMessage, setError);
  const { groupForm, editingGroupId, showAddGroup, handleGroupFormChange, openAddGroup, openEditGroup, cancelGroupForm, handleSubmitGroup, handleDeleteGroup } = useWOModelSerial(id, load, setMessage, setError);
  const { savingTaskId, notes, setNotes, savingNotes, editing, setEditing, handleCompleteTask, handleSaveNotes } = useWOProductionNotes(id, wo?.notes, setMessage, setError);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = hasRole('ADMIN');
  const isOwner = !!wo && Number(wo.created_by) === Number(user?.id);
  const isGranted = !!wo && access.some((a) => Number(a.user_id) === Number(user?.id));
  const canManageAccess = isAdmin || isOwner;
  const canEdit = isAdmin || isOwner || isGranted;

    const capitalizeWords = (value = '') =>
    value
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());

  const handleItemChange = (event) => {
    setItemForm({ ...itemForm, [event.target.name]: event.target.value });
  };

  const openAddItem = () => {
    setEditingItemId(null);
    setItemForm({ ...emptyItemForm });
    setShowAddItemForm(true);
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post(`/work-orders/${id}/items`, {
        ...itemForm,
        title: capitalizeWords(itemForm.title),
        quantity: parseInt(itemForm.quantity, 10) || 1,
        documentation_readiness: itemForm.documentation_readiness || null,
        });
      setItemForm(emptyItemForm);      
      setAnalysis(null);
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
      title: item.title,
      quantity: item.quantity,
      documentation_readiness: item.documentation_readiness || '',
    });
  };

  const handleUpdateItem = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.put(`/work-orders/items/${editingItemId}`, {
        title: capitalizeWords(itemForm.title),
        quantity: parseInt(itemForm.quantity, 10) || 1,
        documentation_readiness: itemForm.documentation_readiness || null,
      });
      setEditingItemId(null);
      setItemForm(emptyItemForm);
      setAnalysis(null);
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
      setAnalysis(null);
      setMessage('Item deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete item');
    }
  };

  const woModelCode = wo && wo.groups && wo.groups.length > 0 ? wo.groups[0].machine_model_code || '' : '';

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
      if (err.response?.status === 409) { await load(); }
    } finally {
      setStartingProduction(false);
    }
  };

  const handleCompleteProduction = async () => {
    if (!window.confirm('Complete this work order?')) return;
    setError('');
    setMessage('');
    setCompleting(true);
    try {
      await api.post(`/work-orders/${id}/production/complete`);
      setMessage('Work order completed');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete work order');
      if (err.response?.status === 409) { await load(); }
    } finally {
      setCompleting(false);
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
    completing,
    savingTaskId,
    message,
    itemForm,
    editingItemId,
    showAddItemForm,
    groupForm,
    editingGroupId,
    showAddGroup,
    woModelCode,
    access,
    accessBusy,
    users,
    notes,
    setNotes,
    savingNotes,
    editing,
    setEditing,
    handleSaveNotes,
    canEdit,
    canManageAccess,
    isOwner,
    isAdmin,
    handleItemChange,
    openAddItem,
    handleAddItem,
    handleEditItem,
    handleUpdateItem,
    cancelEdit,
    handleDeleteItem,
    handleGroupFormChange,
    openAddGroup: () => openAddGroup(woModelCode),
    openEditGroup,
    cancelGroupForm,
    handleSubmitGroup,
    handleDeleteGroup,
    handleAnalyze,
    handleFinalize,
    handleStartProduction,
    handleCompleteProduction,
    handleCompleteTask: (taskId, completed) => handleCompleteTask(taskId, completed, load),
    handleGrantAccess,
    handleRevokeAccess,
  };
}