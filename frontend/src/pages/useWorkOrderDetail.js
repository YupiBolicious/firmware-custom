import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyItemForm = { title: '', description: '', quantity: 1, work_order_group_id: '' };
const emptyGroupForm = { machine_model_id: '', machine_model_version_id: '', serial_number: '' };

export default function useWorkOrderDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const [wo, setWo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [message, setMessage] = useState('');
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [access, setAccess] = useState([]);
  const [accessBusy, setAccessBusy] = useState(null);
  const [users, setUsers] = useState([]);

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

  const loadAccess = async () => {
    try {
      const res = await api.get(`/work-orders/${id}/access`);
      setAccess(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      setAccess([]);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/users/pm');
      setUsers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      setUsers([]);
    }
  };

  useEffect(() => {
    load();
    loadDocuments();
    loadAccess();
    if(hasRole('ADMIN') || hasRole('PM'))
    loadUsers();
  }, [id, hasRole]);

  const isAdmin = hasRole('ADMIN');
  const isOwner = !!wo && Number(wo.created_by) === Number(user?.id);
  const isGranted = !!wo && access.some((a) => Number(a.user_id) === Number(user?.id));
  const canManageAccess = isAdmin || isOwner;
  const canEdit = isAdmin || isOwner || isGranted;

  const handleItemChange = (event) => {
    setItemForm({ ...itemForm, [event.target.name]: event.target.value });
  };
//stored in capitalized
    const capitalizeWords = (value = '') =>
    value
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());

  const openAddItem = (groupId) => {
    setEditingItemId(null);
    setItemForm({ ...emptyItemForm, work_order_group_id: groupId || '' });
    setShowAddItemForm(true);
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post(`/work-orders/${id}/items`, {
        ...itemForm,
        //store in capitalized and trimmed
        title: capitalizeWords(itemForm.title),
        description: capitalizeWords(itemForm.description),
        quantity: parseInt(itemForm.quantity, 10) || 1,
        work_order_group_id: parseInt(itemForm.work_order_group_id, 10) || null,
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

  const handleGroupFormChange = (event) => {
    const { name, value } = event.target;
    setGroupForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAddGroup = () => {
    setEditingGroupId(null);
    setGroupForm(emptyGroupForm);
    setShowAddGroup(true);
  };

  const openEditGroup = (group) => {
    setEditingGroupId(group.id);
    setGroupForm({
      machine_model_id: group.machine_model_code || '',
      machine_model_version_id: group.machine_model_version || '',
      serial_number: group.serial_number || '',
    });
    setShowAddGroup(true);
  };

  const cancelGroupForm = () => {
    setEditingGroupId(null);
    setShowAddGroup(false);
    setGroupForm(emptyGroupForm);
  };

  const handleSubmitGroup = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const payload = {
      machine_model_id: groupForm.machine_model_id.trim(),
      machine_model_version_id: groupForm.machine_model_version_id && groupForm.machine_model_version_id.trim() ? groupForm.machine_model_version_id.trim() : undefined,
      serial_number: groupForm.serial_number && groupForm.serial_number.trim() ? groupForm.serial_number.trim() : undefined,
    };
    try {
      if (editingGroupId) {
        await api.put(`/work-orders/${id}/groups/${editingGroupId}`, payload);
        setMessage('Group updated');
      } else {
        await api.post(`/work-orders/${id}/groups`, payload);
        setMessage('Group added');
      }
      cancelGroupForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save group');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Delete this group?')) return;
    setError('');
    setMessage('');
    try {
      await api.delete(`/work-orders/${id}/groups/${groupId}`);
      setMessage('Group deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group');
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
    } finally {
      setCompleting(false);
    }
  };

  const handleCompleteTask = async (taskId, completed) => {
    setError('');
    setMessage('');
    setSavingTaskId(taskId);
    try {
      await api.put(`/work-orders/${id}/production/tasks/${taskId}`, { completed });
      setMessage(completed ? 'Production item completed' : 'Production item reopened');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update production item');
    } finally {
      setSavingTaskId(null);
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

  const handleGrantAccess = async (targetUserId) => {
    const targetId = parseInt(targetUserId, 10);
    if (!Number.isInteger(targetId) || targetId < 1) return;
    setError('');
    setAccessBusy('grant');
    try {
      await api.post(`/work-orders/${id}/access`, { user_id: targetId });
      setMessage('Access granted');
      await loadAccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to grant access');
    } finally {
      setAccessBusy(null);
    }
  };

  const handleRevokeAccess = async (targetUserId) => {
    if (!window.confirm('Revoke access for this user?')) return;
    setError('');
    setAccessBusy(targetUserId);
    try {
      await api.delete(`/work-orders/${id}/access/${targetUserId}`);
      setMessage('Access revoked');
      await loadAccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke access');
    } finally {
      setAccessBusy(null);
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
    uploading,
    analysis,
    message,
    itemForm,
    editingItemId,
    showAddItemForm,
    documents,
    groupForm,
    editingGroupId,
    showAddGroup,
    access,
    accessBusy,
    users,
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
    openAddGroup,
    openEditGroup,
    cancelGroupForm,
    handleSubmitGroup,
    handleDeleteGroup,
    handleAnalyze,
    handleFinalize,
    handleStartProduction,
    handleCompleteProduction,
    handleCompleteTask,
    handleUploadDocuments,
    handleDeleteDocument,
    handleGrantAccess,
    handleRevokeAccess,
  };
}