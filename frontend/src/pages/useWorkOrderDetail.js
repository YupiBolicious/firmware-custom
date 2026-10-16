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
  const [correctionLevels, setCorrectionLevels] = useState([]);
  const [correctionForm, setCorrectionForm] = useState(null);
  const [correctingItemId, setCorrectingItemId] = useState(null);
  const [correctionConfirmOpen, setCorrectionConfirmOpen] = useState(false);

  useEffect(() => {
    if (!hasRole('CODER')) return;
    api.get('/complexity-levels')
      .then((res) => setCorrectionLevels((res.data.data || []).filter((level) => level.is_active && /^L[0-5]$/.test(level.code))))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load complexity levels'));
  }, []);

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

  const { analyzing, setAnalysis, handleAnalyze } = useWOAnalysis(id, load, setMessage, setError);
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

  const beginCorrection = (item) => {
    setCorrectionForm({
      itemId: item.id,
      complexityLevelId: String(item.complexity_level_id || ''),
      reason: '',
    });
  };

  const cancelCorrection = () => {
    setCorrectionConfirmOpen(false);
    setCorrectionForm(null);
  };

  const updateCorrectionForm = (patch) => {
    setCorrectionForm((current) => current ? { ...current, ...patch } : current);
  };

  const saveCorrection = async (item) => {
    if (!correctionForm || Number(correctionForm.itemId) !== Number(item.id)) return;
    const level = correctionLevels.find((candidate) => String(candidate.id) === correctionForm.complexityLevelId);
    if (!level) return;
    setCorrectionConfirmOpen(true);
  };

  const confirmCorrection = async () => {
    if (!correctionForm) return;
    const item = (wo?.items || []).find((candidate) => Number(candidate.id) === Number(correctionForm.itemId));
    const level = correctionLevels.find((candidate) => String(candidate.id) === correctionForm.complexityLevelId);
    if (!item || !level) return;
    setError('');
    setCorrectingItemId(item.id);
    try {
      await api.put(`/work-orders/items/${item.id}/review-correction`, {
        complexity_level_id: Number(level.id),
        reason: correctionForm.reason.trim() || undefined,
      });
      setCorrectionConfirmOpen(false);
      setCorrectionForm(null);
      setMessage(`Decision corrected to ${level.code}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to correct classification');
      if (err.response?.status === 409) await load();
    } finally {
      setCorrectingItemId(null);
    }
  };

  const correctionConfirmMessage = (() => {
    if (!correctionForm) return '';
    const item = (wo?.items || []).find((candidate) => Number(candidate.id) === Number(correctionForm.itemId));
    const level = correctionLevels.find((candidate) => String(candidate.id) === correctionForm.complexityLevelId);
    return item && level
      ? `Change ${item.item_number} from ${item.complexity_code || 'unassigned'} to ${level.code}?`
      : '';
  })();

  const woModelCode = wo && wo.groups && wo.groups.length > 0 ? wo.groups[0].machine_model_code || '' : '';
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [startConfirm, setStartConfirm] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(false);
  
  const openFinalizeConfirm = () => setFinalizeConfirm(true);
  const closeFinalizeConfirm = () => { if (finalizing) return; setFinalizeConfirm(false); };
  const openStartConfirm = () => setStartConfirm(true);
  const closeStartConfirm = () => { if (startingProduction) return; setStartConfirm(false); };
  const openCompleteConfirm = () => setCompleteConfirm(true);
  const closeCompleteConfirm = () => { if (completing) return; setCompleteConfirm(false); };


  const handleFinalize = async () => {
    setError('');
    setMessage('');
    setFinalizing(true);
    try {
      const response = await api.post(`/work-orders/${id}/finalize`);
      setMessage(response.data?.data?.work_order?.status === 'COMPLETED'
        ? 'Work order completed; no firmware production was required'
        : 'Work order finalized');
      await load();
      setFinalizeConfirm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to finalize work order');
    } finally {
      setFinalizing(false);
    }
  };

  const handleStartProduction = async () => {
    setError('');
    setMessage('');
    setStartingProduction(true);
    try {
      await api.post(`/work-orders/${id}/production`);
      setMessage('Work order moved to production');
      await load();
      setStartConfirm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start production');
      if (err.response?.status === 409) { await load(); }
    } finally {
      setStartingProduction(false);
    }
  };

  const handleCompleteProduction = async () => {
    setError('');
    setMessage('');
    setCompleting(true);
    try {
      await api.post(`/work-orders/${id}/production/complete`);
      setMessage('Work order completed');
      await load();
      setCompleteForm(false);
      setCompleteConfirm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete work order');
      if (err.response?.status === 409) { await load(); }
    } finally {
      setCompleting(false);
    }
  };

  return {
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
    handleItemChange,
    openAddItem,
    handleAddItem,
    handleEditItem,
    handleUpdateItem,
    cancelEdit,
    handleDeleteItem,
    correctionLevels,
    correctionForm,
    correctingItemId,
    correctionConfirmOpen,
    correctionConfirmMessage,
    beginCorrection,
    cancelCorrection,
    updateCorrectionForm,
    saveCorrection,
    confirmCorrection,
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
    finalizeConfirm,
    startConfirm,
    completeConfirm,
    openFinalizeConfirm,
    closeFinalizeConfirm,
    openStartConfirm,
    closeStartConfirm,
    openCompleteConfirm,
    closeCompleteConfirm,
    handleCompleteTask: (taskId, completed) => handleCompleteTask(taskId, completed, load),
    handleGrantAccess,
    handleRevokeAccess,
  };
}
